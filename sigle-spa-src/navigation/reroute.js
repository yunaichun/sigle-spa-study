import CustomEvent from "custom-event";
import { isStarted } from "../start.js";
import { toUnloadPromise } from "../lifecycles/unload.js";
import { toUnmountPromise } from "../lifecycles/unmount.js";
import { toLoadPromise } from "../lifecycles/load.js";
import { toBootstrapPromise } from "../lifecycles/bootstrap.js";
import { toMountPromise } from "../lifecycles/mount.js";
import {
  getAppStatus,
  getAppChanges,
  getMountedApps,
} from "../applications/apps.js";
import { callCapturedEventListeners } from "./navigation-events.js";
import {
  toName,
  shouldBeActive,
  NOT_MOUNTED,
  MOUNTED,
  NOT_LOADED,
  SKIP_BECAUSE_BROKEN,
} from "../applications/app.helpers.js";

let appChangeUnderway = false,
  peopleWaitingOnAppChange = [];

export function triggerAppChange() {
  // Call reroute with no arguments, intentionally
  return reroute();
}

export function reroute(pendingPromises = [], eventArguments) {
  // == 1、应用改变的话
  if (appChangeUnderway) {
    return new Promise((resolve, reject) => {
      // == 加入队列
      peopleWaitingOnAppChange.push({
        resolve,
        reject,
        eventArguments,
      });
    });
  }

  // == 2、应用未改变的话：获取未载入、待卸载、待载入、已挂载的子应用
  const {
    appsToUnload,
    appsToUnmount,
    appsToLoad,
    appsToMount,
  } = getAppChanges();
  let appsThatChanged;

  
  if (isStarted()) {
    // == 执行了 start 方法
    appChangeUnderway = true;
    appsThatChanged = appsToUnload.concat(
      appsToLoad,
      appsToUnmount,
      appsToMount
    );
    return performAppChanges();
  } else {
    // == 没有执行 start 方法
    appsThatChanged = appsToLoad;
    return loadApps();
  }

  // == 主路由没有执行 start 方法
  function loadApps() {
    return Promise.resolve().then(() => {
      const loadPromises = appsToLoad.map(toLoadPromise);

      return (
        Promise.all(loadPromises)
          .then(callAllEventListeners)
          // there are no mounted apps, before start() is called, so we always return []
          .then(() => [])
          .catch((err) => {
            callAllEventListeners();
            throw err;
          })
      );
    });
  }

  // == 主路由已经执行过 start 函数
  function performAppChanges() {
    return Promise.resolve().then(() => {
      // https://github.com/single-spa/single-spa/issues/545
      window.dispatchEvent(
        new CustomEvent(
          appsThatChanged.length === 0
            ? "single-spa:before-no-app-change"
            : "single-spa:before-app-change",
          getCustomEventDetail(true)
        )
      );

      window.dispatchEvent(
        new CustomEvent(
          "single-spa:before-routing-event",
          getCustomEventDetail(true)
        )
      );

      // == 返回 Promise 对象：轮循子应用的 unload 方法
      const unloadPromises = appsToUnload.map(toUnloadPromise);

      // == 返回 Promise 对象：轮循子应用的 unmount 方法
      const unmountUnloadPromises = appsToUnmount
        .map(toUnmountPromise)
        .map((unmountPromise) => unmountPromise.then(toUnloadPromise));

      // == 在挂载前执行 unload 和 unmount 方法
      const allUnmountPromises = unmountUnloadPromises.concat(unloadPromises);
      const unmountAllPromise = Promise.all(allUnmountPromises);
      unmountAllPromise.then(() => {
        window.dispatchEvent(
          new CustomEvent(
            "single-spa:before-mount-routing-event",
            getCustomEventDetail(true)
          )
        );
      });

      /* We load and bootstrap apps while other apps are unmounting, but we
      * wait to mount the app until all apps are finishing unmounting
      */
      // == 返回 Promise 对象：挂载子应用 app 的 bootstrap、mount、unmount、unload 方法
      const loadThenMountPromises = appsToLoad.map((app) => {
        return toLoadPromise(app).then((app) =>
          // == bootstrap -> mount
          tryToBootstrapAndMount(app, unmountAllPromise)
        );
      });

      /* These are the apps that are already bootstrapped and just need
       * to be mounted. They each wait for all unmounting apps to finish up
       * before they mount.
       */
      // == bootstrap -> mount
      const mountPromises = appsToMount
        .filter((appToMount) => appsToLoad.indexOf(appToMount) < 0)
        .map((appToMount) => {
          // == bootstrap -> mount
          return tryToBootstrapAndMount(appToMount, unmountAllPromise);
        });

      // == 最终返回：已经加载的子应用
      return unmountAllPromise
        .catch((err) => {
          callAllEventListeners();
          throw err;
        })
        .then(() => {
          /* Now that the apps that needed to be unmounted are unmounted, their DOM navigation
           * events (like hashchange or popstate) should have been cleaned up. So it's safe
           * to let the remaining captured event listeners to handle about the DOM event.
           */
          callAllEventListeners();

          return Promise.all(loadThenMountPromises.concat(mountPromises))
            .catch((err) => {
              pendingPromises.forEach((promise) => promise.reject(err));
              throw err;
            })
            .then(finishUpAndReturn);
        });
    });
  }

  // == 所有子应用状态更新完成后
  function finishUpAndReturn() {
    // == 获取已经加载的子应用
    const returnValue = getMountedApps();
    pendingPromises.forEach((promise) => promise.resolve(returnValue));

    // == 触发指定回调事件
    try {
      const appChangeEventName =
        appsThatChanged.length === 0
          ? "single-spa:no-app-change"
          : "single-spa:app-change";
      window.dispatchEvent(
        new CustomEvent(appChangeEventName, getCustomEventDetail())
      );
      window.dispatchEvent(
        new CustomEvent("single-spa:routing-event", getCustomEventDetail())
      );
    } catch (err) {
      /* We use a setTimeout because if someone else's event handler throws an error, single-spa
       * needs to carry on. If a listener to the event throws an error, it's their own fault, not
       * single-spa's.
       */
      setTimeout(() => {
        throw err;
      });
    }

    /* Setting this allows for subsequent calls to reroute() to actually perform
     * a reroute instead of just getting queued behind the current reroute call.
     * We want to do this after the mounting/unmounting is done but before we
     * resolve the promise for the `reroute` function.
     */
    appChangeUnderway = false;

    // == 重新 reroute
    if (peopleWaitingOnAppChange.length > 0) {
      /* While we were rerouting, someone else triggered another reroute that got queued.
       * So we need reroute again.
       */
      const nextPendingPromises = peopleWaitingOnAppChange;
      peopleWaitingOnAppChange = [];
      reroute(nextPendingPromises);
    }

    return returnValue;
  }

  /* We need to call all event listeners that have been delayed because they were
   * waiting on single-spa. This includes haschange and popstate events for both
   * the current run of performAppChanges(), but also all of the queued event listeners.
   * We want to call the listeners in the same order as if they had not been delayed by
   * single-spa, which means queued ones first and then the most recent one.
   */
  // == 调用捕获的事件侦听器：hashchange、popstate
  function callAllEventListeners() {
    pendingPromises.forEach((pendingPromise) => {
      callCapturedEventListeners(pendingPromise.eventArguments);
    });

    callCapturedEventListeners(eventArguments);
  }

  // == 自定义事件传递的参数
  function getCustomEventDetail(isBeforeChanges = false) {
    const newAppStatuses = {};
    const appsByNewStatus = {
      // for apps that were mounted
      [MOUNTED]: [],
      // for apps that were unmounted
      [NOT_MOUNTED]: [],
      // apps that were forcibly unloaded
      [NOT_LOADED]: [],
      // apps that attempted to do something but are broken now
      [SKIP_BECAUSE_BROKEN]: [],
    };

    if (isBeforeChanges) {
      // == isBeforeChanges 为 true
      appsToLoad.concat(appsToMount).forEach((app, index) => {
        addApp(app, MOUNTED);
      });
      appsToUnload.forEach((app) => {
        addApp(app, NOT_LOADED);
      });
      appsToUnmount.forEach((app) => {
        addApp(app, NOT_MOUNTED);
      });
    } else {
      // == isBeforeChanges 为 false
      appsThatChanged.forEach((app) => {
        addApp(app);
      });
    }

    // == 
    return {
      detail: {
        newAppStatuses, // == 默认空对象
        appsByNewStatus, // == 该比昂状态的子应用
        totalAppChanges: appsThatChanged.length, // == 所有改变应用的长度
        originalEvent: eventArguments?.[0],
      },
    };

    // == 将应用加入加入某一统一状态的应用队列中
    function addApp(app, status) {
      // == 子应用名称
      const appName = toName(app);
      // == 获取子应用为 appName 的应用状态
      status = status || getAppStatus(appName);
      newAppStatuses[appName] = status;
      const statusArr = (appsByNewStatus[status] =
        appsByNewStatus[status] || []);
      statusArr.push(appName);
    }
  }
}

/**
 * Let's imagine that some kind of delay occurred during application loading.
 * The user without waiting for the application to load switched to another route,
 * this means that we shouldn't bootstrap and mount that application, thus we check
 * twice if that application should be active before bootstrapping and mounting.
 * https://github.com/single-spa/single-spa/issues/524
 */
// == bootstrap -> mount
function tryToBootstrapAndMount(app, unmountAllPromise) {
  if (shouldBeActive(app)) {
    // == 返回 Promise 对象：轮循子应用的 bootstrap 方法
    return toBootstrapPromise(app).then((app) =>
      unmountAllPromise.then(() =>
        // == 返回 Promise 对象：轮循子应用的 mount 方法
        shouldBeActive(app) ? toMountPromise(app) : app
      )
    );
  } else {
    return unmountAllPromise.then(() => app);
  }
}
