import { routingEventsListeningTo } from "./navigation/navigation-events.js";

let hasInitialized = false;


// == 有 jQuery 的情况，采会这么去做
export function ensureJQuerySupport(jQuery = window.jQuery) {
  // == 判断浏览器环境是否有 jQuery 引入
  if (!jQuery) {
    if (window.$ && window.$.fn && window.$.fn.jquery) {
      jQuery = window.$;
    }
  }

  // == 保证只会初始化一次
  if (jQuery && !hasInitialized) {
    const originalJQueryOn = jQuery.fn.on;
    const originalJQueryOff = jQuery.fn.off;

    // == jQuery.fn 是 jQuery 的原型对象，其 extend() 方法用于为 jQuery 的原型添加新的属性和方法。这些方法可以在 jQuery 实例对象上调用
    jQuery.fn.on = function (eventString, fn) {
      return captureRoutingEvents.call(
        this,
        originalJQueryOn,
        window.addEventListener,
        eventString,
        fn,
        arguments
      );
    };

    // == 卸载
    jQuery.fn.off = function (eventString, fn) {
      return captureRoutingEvents.call(
        this,
        originalJQueryOff,
        window.removeEventListener,
        eventString,
        fn,
        arguments
      );
    };

    hasInitialized = true;
  }
}

// == 事件处理：1、eventString 数组或者字符串情况  2、事件名称是否包含 "hashchange" 或 "popstate"
function captureRoutingEvents(
  originalJQueryFunction, // == jQuery 的 on 事件
  nativeFunctionToCall, // == 浏览器的 addEventListener 事件
  eventString, // == 监听事件名称
  fn, // == 监听事件回调
  originalArgs
) {
  // == eventString 是数组的情况，返回 jQuery 的事件回调
  if (typeof eventString !== "string") {
    return originalJQueryFunction.apply(this, originalArgs);
  }

  // == eventString 是字符串的情况，转换为数组
  const eventNames = eventString.split(/\s+/);
  eventNames.forEach((eventName) => {
    // == eventName 包含 "hashchange" 或 "popstate" 事件
    if (routingEventsListeningTo.indexOf(eventName) >= 0) {
      // == 调用浏览器的事件回调
      nativeFunctionToCall(eventName, fn);
      // == eventString 中剔除此事件
      eventString = eventString.replace(eventName, "");
    }
  });

  if (eventString.trim() === "") {
    return this;
  } else {
    // == 除了 "hashchange" 或 "popstate" 事件，其余全部调用 jQuery 的 on 事件
    return originalJQueryFunction.apply(this, originalArgs);
  }
}
