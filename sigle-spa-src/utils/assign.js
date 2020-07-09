// Object.assign() is not available in IE11. And the babel compiled output for object spread
// syntax checks a bunch of Symbol stuff and is almost a kb. So this function is the smaller replacement.
export function assign() {
  // == 从后往前遍历传递进来的参数对象
  for (let i = arguments.length - 1; i > 0; i--) {
    // == 遍历参数的每一个 key 值
    for (let key in arguments[i]) {
      // == 不能重写 __proto__ 属性
      if (key === "__proto__") {
        continue;
      }
      // == 往前一个对象去合并
      arguments[i - 1][key] = arguments[i][key];
    }
  }

  // == 返回第一个参数对象
  return arguments[0];
}
