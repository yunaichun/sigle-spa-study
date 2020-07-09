import { handleAppError } from "./app-errors.js";

// App statuses
export const NOT_LOADED = "NOT_LOADED";
export const LOADING_SOURCE_CODE = "LOADING_SOURCE_CODE";
export const NOT_BOOTSTRAPPED = "NOT_BOOTSTRAPPED";
export const BOOTSTRAPPING = "BOOTSTRAPPING";
export const NOT_MOUNTED = "NOT_MOUNTED";
export const MOUNTING = "MOUNTING";
export const MOUNTED = "MOUNTED";
export const UPDATING = "UPDATING";
export const UNMOUNTING = "UNMOUNTING";
export const UNLOADING = "UNLOADING";
export const LOAD_ERROR = "LOAD_ERROR";
export const SKIP_BECAUSE_BROKEN = "SKIP_BECAUSE_BROKEN";

export function isActive(app) {
  return app.status === MOUNTED;
}

// == 子应用是否是激活的状态
export function shouldBeActive(app) {
  try {
    // == 子应用上有 activeWhen 的属性，判断当前浏览器路径是否匹配上此子应用的 activeWhen
    return app.activeWhen(window.location);
  } catch (err) {
    handleAppError(err, app, SKIP_BECAUSE_BROKEN);
    return false;
  }
}

// == 返回 app 的 name
export function toName(app) {
  return app.name;
}

// == appOrParcel.unmountThisParcel 是否为 true
export function isParcel(appOrParcel) {
  return Boolean(appOrParcel.unmountThisParcel);
}

// == appOrParcel.unmountThisParcel 是否存在
export function objectType(appOrParcel) {
  return isParcel(appOrParcel) ? "parcel" : "application";
}
