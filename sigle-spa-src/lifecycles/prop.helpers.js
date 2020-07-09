import * as singleSpa from "../single-spa.js";
import { mountParcel } from "../parcels/mount-parcel.js";
import { assign } from "../utils/assign.js";
import { isParcel, toName } from "../applications/app.helpers.js";
import { formatErrorMessage } from "../applications/app-errors.js";

// == 拿到子应用传递的自定义参数 customProps
export function getProps(appOrParcel) {
  // == 拿到当前子应用的 customProps
  const name = toName(appOrParcel);
  let customProps =
    typeof appOrParcel.customProps === "function"
      ? appOrParcel.customProps(name, window.location)
      : appOrParcel.customProps;
  
  // == customProps 必须得是对象
  if (
    typeof customProps !== "object" ||
    customProps === null ||
    Array.isArray(customProps)
  ) {
    customProps = {};
    console.warn(
      formatErrorMessage(
        40,
        __DEV__ &&
          `single-spa: ${name}'s customProps function must return an object. Received ${customProps}`
      ),
      name,
      customProps
    );
  }

  // == 合并对象参数
  const result = assign({}, customProps, {
    name,
    mountParcel: mountParcel.bind(appOrParcel),
    singleSpa,
  });

  // == appOrParcel.unmountThisParcel 是否为 true
  if (isParcel(appOrParcel)) {
    result.unmountSelf = appOrParcel.unmountThisParcel;
  }

  return result;
}
