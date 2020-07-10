import { find } from "../utils/find.js";
import { objectType, toName } from "../applications/app.helpers.js";
import { formatErrorMessage } from "../applications/app-errors.js";

// == fn 是单独的函数或者数组函数
export function validLifecycleFn(fn) {
  return fn && (typeof fn === "function" || isArrayOfFns(fn));

  function isArrayOfFns(arr) {
    return (
      Array.isArray(arr) && !find(arr, (item) => typeof item !== "function")
    );
  }
}

// == appOrParcel - 子应用入口组件
// == lifecycle -   子应用 lifecycle 方法
export function flattenFnArray(appOrParcel, lifecycle) {
  // == 此方法包装成数组往下处理
  let fns = appOrParcel[lifecycle] || [];
  fns = Array.isArray(fns) ? fns : [fns];
  if (fns.length === 0) {
    fns = [() => Promise.resolve()];
  }

  const type = objectType(appOrParcel);
  const name = toName(appOrParcel);

  // == 返回一个函数，此函数的执行返回一个 Promise 对象
  return function (props) {
    return fns.reduce((resultPromise, fn, index) => {
      // == 循环执行 fns 的每一项
      return resultPromise.then(() => {
        const thisPromise = fn(props);
        // == 确保每个钩子都是一个 Promise
        return smellsLikeAPromise(thisPromise)
          ? thisPromise
          : Promise.reject(
              formatErrorMessage(
                15,
                __DEV__ &&
                  `Within ${type} ${name}, the lifecycle function ${lifecycle} at array index ${index} did not return a promise`,
                type,
                name,
                lifecycle,
                index
              )
            );
      });
    }, Promise.resolve());
  };
}

// == 类 Promise 对象
export function smellsLikeAPromise(promise) {
  return (
    promise &&
    typeof promise.then === "function" &&
    typeof promise.catch === "function"
  );
}
