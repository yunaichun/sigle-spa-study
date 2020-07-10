import { reroute } from "./navigation/reroute.js";
import { formatErrorMessage } from "./applications/app-errors.js";
import { setUrlRerouteOnly } from "./navigation/navigation-events.js";
import { isInBrowser } from "./utils/runtime-environment.js";

let started = false;

// == 主路由开始执行方法：在注册的时候已经执行 reroute 方法了
export function start(opts) {
  started = true;
  if (opts && opts.urlRerouteOnly) {
    setUrlRerouteOnly(opts.urlRerouteOnly);
  }
  // == 执行 reroute 方法
  if (isInBrowser) {
    reroute();
  }
}

// == 返回 started 值。初始为 false ，初始化后为 true
export function isStarted() {
  return started;
}

if (isInBrowser) {
  setTimeout(() => {
    if (!started) {
      console.warn(
        formatErrorMessage(
          1,
          __DEV__ &&
            `singleSpa.start() has not been called, 5000ms after single-spa was loaded. Before start() is called, apps can be declared and loaded, but not bootstrapped or mounted.`
        )
      );
    }
  }, 5000);
}
