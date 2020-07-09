import { ensureJQuerySupport } from "../jquery-support.js";
import {
  isActive,
  toName,
  NOT_LOADED,
  NOT_BOOTSTRAPPED,
  NOT_MOUNTED,
  MOUNTED,
  LOAD_ERROR,
  SKIP_BECAUSE_BROKEN,
  LOADING_SOURCE_CODE,
  shouldBeActive,
} from "./app.helpers.js";
import { reroute } from "../navigation/reroute.js";
import { find } from "../utils/find.js";
import { toUnmountPromise } from "../lifecycles/unmount.js";
import {
  toUnloadPromise,
  getAppUnloadInfo,
  addAppToUnload,
} from "../lifecycles/unload.js";
import { formatErrorMessage } from "./app-errors.js";
import { isInBrowser } from "../utils/runtime-environment.js";
import { assign } from "../utils/assign";

const apps = [];

// == 主路由注册事件
export function registerApplication(
  appNameOrConfig, // == 子应用名称
  appOrLoadApp, // == 子应用入口文件
  activeWhen, // == 子应用激活时机
  customProps // == 自定义属性
) {
  // == 规范化传递的参数
  const registration = sanitizeArguments(
    appNameOrConfig,
    appOrLoadApp,
    activeWhen,
    customProps
  );

  // == 不能注册两个相同的应用
  if (getAppNames().indexOf(registration.name) !== -1)
    throw Error(
      formatErrorMessage(
        21,
        __DEV__ &&
          `There is already an app registered with name ${registration.name}`,
        registration.name
      )
    );

  // == 往 apps 塞进去注册的子应用
  apps.push(
    assign(
      {
        loadErrorTime: null, // == 载入错误的话会在 200ms 之后重新载入 
        status: NOT_LOADED, // == 初始状态均为未载入
        parcels: {},
        devtools: {
          overlays: {
            options: {},
            selectors: [],
          },
        },
      },
      registration
    )
  );

  // == 如果在浏览器环境
  if (isInBrowser) {
    // == 假如有 jQuery  对包含或不包含 "hashchange" 或 "popstate" 的事件处理
    ensureJQuerySupport();
    reroute();
  }
}

// == 校验和规范化传递的参数
function sanitizeArguments(
  appNameOrConfig,
  appOrLoadApp,
  activeWhen,
  customProps
) {
  const usingObjectAPI = typeof appNameOrConfig === "object";

  const registration = {
    name: null,
    loadApp: null,
    activeWhen: null,
    customProps: null,
  };

  if (usingObjectAPI) {
    // == 先校验传递的参数：可以直接以一个对象传递参数
    validateRegisterWithConfig(appNameOrConfig);
    registration.name = appNameOrConfig.name;
    registration.loadApp = appNameOrConfig.app;
    registration.activeWhen = appNameOrConfig.activeWhen;
    registration.customProps = appNameOrConfig.customProps;
  } else {
    // == 先校验传递的参数：分散传入
    validateRegisterWithArguments(
      appNameOrConfig,
      appOrLoadApp,
      activeWhen,
      customProps
    );
    registration.name = appNameOrConfig;
    registration.loadApp = appOrLoadApp;
    registration.activeWhen = activeWhen;
    registration.customProps = customProps;
  }

  registration.loadApp = sanitizeLoadApp(registration.loadApp);
  registration.activeWhen = sanitizeActiveWhen(registration.activeWhen);
  registration.customProps = sanitizeCustomProps(registration.customProps);

  return registration;
}

// == 校验传递的参数：以对象传入
export function validateRegisterWithConfig(config) {
  // == 不能以数组传入
  if (Array.isArray(config) || config === null)
    throw Error(
      formatErrorMessage(
        39,
        __DEV__ && "Configuration object can't be an Array or null!"
      )
    );
  const validKeys = ["name", "app", "activeWhen", "customProps"];
  const invalidKeys = Object.keys(config).reduce(
    (invalidKeys, prop) =>
      validKeys.indexOf(prop) >= 0 ? invalidKeys : invalidKeys.concat(prop),
    []
  );
  // == 不能传递非法参数 key
  if (invalidKeys.length !== 0)
    throw Error(
      formatErrorMessage(
        38,
        __DEV__ &&
          `The configuration object accepts only: ${validKeys.join(
            ", "
          )}. Invalid keys: ${invalidKeys.join(", ")}.`,
        validKeys.join(", "),
        invalidKeys.join(", ")
      )
    );
  // == name 必须要有
  if (typeof config.name !== "string" || config.name.length === 0)
    throw Error(
      formatErrorMessage(
        20,
        __DEV__ &&
          "The config.name on registerApplication must be a non-empty string"
      )
    );
  // == app 必须是一个函数组件
  if (typeof config.app !== "object" && typeof config.app !== "function")
    throw Error(
      formatErrorMessage(
        20,
        __DEV__ &&
          "The config.app on registerApplication must be an application or a loading function"
      )
    );
  
  const allowsStringAndFunction = (activeWhen) =>
    typeof activeWhen === "string" || typeof activeWhen === "function";
  // == activeWhen 必须是字符串（指定路由）或者是函数（多路由）
  if (
    !allowsStringAndFunction(config.activeWhen) &&
    !(
      Array.isArray(config.activeWhen) &&
      config.activeWhen.every(allowsStringAndFunction)
    )
  )
    throw Error(
      formatErrorMessage(
        24,
        __DEV__ &&
          "The config.activeWhen on registerApplication must be a string, function or an array with both"
      )
    );
  // == 校验传入的自定义属性
  if (!validCustomProps(config.customProps))
    throw Error(
      formatErrorMessage(
        22,
        __DEV__ && "The optional config.customProps must be an object"
      )
    );
}

// == 校验传递的参数：分散传入
function validateRegisterWithArguments(
  name,
  appOrLoadApp,
  activeWhen,
  customProps
) {
  // == name 必须要有
  if (typeof name !== "string" || name.length === 0)
    throw Error(
      formatErrorMessage(
        20,
        __DEV__ &&
          `The 1st argument to registerApplication must be a non-empty string 'appName'`
      )
    );

  // == app 必须是一个函数组件
  if (!appOrLoadApp)
    throw Error(
      formatErrorMessage(
        23,
        __DEV__ &&
          "The 2nd argument to registerApplication must be an application or loading application function"
      )
    );

  // == activeWhen 必须是字符串（指定路由）或者是函数（多路由）
  if (typeof activeWhen !== "function")
    throw Error(
      formatErrorMessage(
        24,
        __DEV__ &&
          "The 3rd argument to registerApplication must be an activeWhen function"
      )
    );

  // == 校验传入的自定义属性
  if (!validCustomProps(customProps))
    throw Error(
      formatErrorMessage(
        22,
        __DEV__ &&
          "The optional 4th argument is a customProps and must be an object"
      )
    );
}

// == 校验传入的自定义属性
function validCustomProps(customProps) {
  // == 1、不传 customProps
  // == 2、customProps 为函数
  // == 3、customProps 为对象
  return (
    !customProps ||
    typeof customProps === "function" ||
    (typeof customProps === "object" &&
      customProps !== null &&
      !Array.isArray(customProps))
  );
}

// == 保证 appOrLoadApp 为一个函数组件
function sanitizeLoadApp(loadApp) {
  if (typeof loadApp !== "function") {
    return () => Promise.resolve(loadApp);
  }

  return loadApp;
}

// == 将 activeWhen 字符串或者函数转换为匹配的正则
function sanitizeActiveWhen(activeWhen) {
  let activeWhenArray = Array.isArray(activeWhen) ? activeWhen : [activeWhen];
  activeWhenArray = activeWhenArray.map((activeWhenOrPath) =>
    typeof activeWhenOrPath === "function"
      ? activeWhenOrPath // == activeWhenOrPath 为函数
      : pathToActiveWhen(activeWhenOrPath) // == activeWhenOrPath 为字符串
  );

  // == 返回一个函数，也就是只要存在一个匹配的浏览器路由即返回 true
  return (location) =>
    activeWhenArray.some((activeWhen) => activeWhen(location));
}

// == 保证 customProps 为一个对象
function sanitizeCustomProps(customProps) {
  return customProps ? customProps : {};
}

// == activeWhen 为字符串的时候：我们需要判断当前页面是否匹配上此路由
export function pathToActiveWhen(path) {
  const regex = toDynamicPathValidatorRegex(path);

  return (location) => {
    // == 拿到当前页面的路由路径
    const route = location.href.replace(location.origin, "");
    // == 返回当前页面路由路径是否匹配动态路由
    return regex.test(route);
  };
}

// == activeWhen 为字符串的时候：解析出包含动态路由的正则匹配规则
export function toDynamicPathValidatorRegex(path) {
  // == 分析：假如是 /a/:id/b/c
  // == 1、解析到 :                     将 regexStr = '/a/'
  // == 2、解析到 :id 后的 /             将 regexStr = '/a/' + ‘[^/]+/?‘
  // == 3、解析 b/c                     将 regexStr = '/a/' + ‘[^/]+/?‘ + ‘b/c’
  // == 4、最后一个字符不是 / 结尾         将 regexStr = '/a/' + ‘[^/]+/?‘ + ‘b/c’ + '\/.*'
  let lastIndex = 0,
    inDynamic = false,
    regexStr = "^";

  // == 遍历字符串 activeWhen 的每一个字符
  for (let charIndex = 0; charIndex < path.length; charIndex++) {
    const char = path[charIndex];
    // == 动态路由以 : 开始
    const startOfDynamic = !inDynamic && char === ":";
    // == 动态路由以 / 结束
    const endOfDynamic = inDynamic && char === "/";
    if (startOfDynamic || endOfDynamic) {
      appendToRegex(charIndex);
    }
  }

  appendToRegex(path.length);

  // == 返回区分大小写的动态路由匹配规则
  return new RegExp(regexStr, "i");

  function appendToRegex(index) {
    const anyCharMaybeTrailingSlashRegex = "[^/]+/?";
    const commonStringSubPath = escapeStrRegex(path.slice(lastIndex, index));

    regexStr += inDynamic
      ? anyCharMaybeTrailingSlashRegex
      : commonStringSubPath;

    // == 最后一个字符默认添加上 /
    if (index === path.length && !inDynamic) {
      regexStr =
        // use charAt instead as we could not use es6 method endsWith
        regexStr.charAt(regexStr.length - 1) === "/"
          ? `${regexStr}.*$`
          : `${regexStr}(\/.*)?$`;
    }

    // == 进入动态路由后开始记录，同时将 lastIndex 重置
    inDynamic = !inDynamic;
    lastIndex = index;
  }

  function escapeStrRegex(str) {
    // borrowed from https://github.com/sindresorhus/escape-string-regexp/blob/master/index.js
    return str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
  }
}

// == 返回 apps 里的 name
export function getAppNames() {
  return apps.map(toName);
}


// == 获取未载入、待卸载、待载入、已挂载的子应用
export function getAppChanges() {
  const appsToUnload = [],
    appsToUnmount = [],
    appsToLoad = [],
    appsToMount = [];

  // We re-attempt to download applications in LOAD_ERROR after a timeout of 200 milliseconds
  const currentTime = new Date().getTime();

  apps.forEach((app) => {
    // == 当前浏览器路径是否匹配上此子应用的 activeWhen
    const appShouldBeActive =
      app.status !== SKIP_BECAUSE_BROKEN && shouldBeActive(app);

    switch (app.status) {
      // == 载入错误的子应用
      case LOAD_ERROR:
        // ===== 200ms 后：加入待载入队列
        if (currentTime - app.loadErrorTime >= 200) {
          appsToLoad.push(app);
        }
        break;
      // == 没有载入的子应用
      case NOT_LOADED:
      case LOADING_SOURCE_CODE:
        // ===== 未激活的子应用：加入待载入队列
        if (appShouldBeActive) {
          appsToLoad.push(app);
        }
        break;
      // == 没有初始化或没有挂载的子应用
      case NOT_BOOTSTRAPPED:
      case NOT_MOUNTED:
        if (!appShouldBeActive && getAppUnloadInfo(toName(app))) {
          // ======= 未激活的、同时再次载入失败过的子应用：加入未载入队列
          appsToUnload.push(app);
        } else if (appShouldBeActive) {
          // ======= 激活的子应用：加入待挂载队列
          appsToMount.push(app);
        }
        break;
      // == 已经挂载的子应用
      case MOUNTED:
        if (!appShouldBeActive) {
          // ======= 未激活的子应用：加入待卸载队列
          appsToUnmount.push(app);
        }
        break;
      // all other statuses are ignored
    }
  });

   // == 未载入、待卸载、待载入、已挂载的子应用
  return { appsToUnload, appsToUnmount, appsToLoad, appsToMount };
}

export function getMountedApps() {
  return apps.filter(isActive).map(toName);
}

// used in devtools, not (currently) exposed as a single-spa API
export function getRawAppData() {
  return [...apps];
}

// == 获取子应用为 appName 的应用状态
export function getAppStatus(appName) {
  const app = find(apps, (app) => toName(app) === appName);
  return app ? app.status : null;
}

export function checkActivityFunctions(location = window.location) {
  return apps.filter((app) => app.activeWhen(location)).map(toName);
}

export function unregisterApplication(appName) {
  if (apps.filter((app) => toName(app) === appName).length === 0) {
    throw Error(
      formatErrorMessage(
        25,
        __DEV__ &&
          `Cannot unregister application '${appName}' because no such application has been registered`,
        appName
      )
    );
  }

  return unloadApplication(appName).then(() => {
    const appIndex = apps.map(toName).indexOf(appName);
    apps.splice(appIndex, 1);
  });
}

export function unloadApplication(appName, opts = { waitForUnmount: false }) {
  if (typeof appName !== "string") {
    throw Error(
      formatErrorMessage(
        26,
        __DEV__ && `unloadApplication requires a string 'appName'`
      )
    );
  }
  const app = find(apps, (App) => toName(App) === appName);
  if (!app) {
    throw Error(
      formatErrorMessage(
        27,
        __DEV__ &&
          `Could not unload application '${appName}' because no such application has been registered`,
        appName
      )
    );
  }

  const appUnloadInfo = getAppUnloadInfo(toName(app));
  if (opts && opts.waitForUnmount) {
    // We need to wait for unmount before unloading the app

    if (appUnloadInfo) {
      // Someone else is already waiting for this, too
      return appUnloadInfo.promise;
    } else {
      // We're the first ones wanting the app to be resolved.
      const promise = new Promise((resolve, reject) => {
        addAppToUnload(app, () => promise, resolve, reject);
      });
      return promise;
    }
  } else {
    /* We should unmount the app, unload it, and remount it immediately.
     */

    let resultPromise;

    if (appUnloadInfo) {
      // Someone else is already waiting for this app to unload
      resultPromise = appUnloadInfo.promise;
      immediatelyUnloadApp(app, appUnloadInfo.resolve, appUnloadInfo.reject);
    } else {
      // We're the first ones wanting the app to be resolved.
      resultPromise = new Promise((resolve, reject) => {
        addAppToUnload(app, () => resultPromise, resolve, reject);
        immediatelyUnloadApp(app, resolve, reject);
      });
    }

    return resultPromise;
  }
}

function immediatelyUnloadApp(app, resolve, reject) {
  toUnmountPromise(app)
    .then(toUnloadPromise)
    .then(() => {
      resolve();
      setTimeout(() => {
        // reroute, but the unload promise is done
        reroute();
      });
    })
    .catch(reject);
}
