/* We don't import parcel.component.js from this file intentionally. See comment
 * in that file for why
 */

// React context that gives any react component the single-spa props
export let SingleSpaContext = null;

const defaultOpts = {
  // required opts
  React: null,
  ReactDOM: null,
  rootComponent: null,
  loadRootComponent: null,
  suppressComponentDidCatchWarning: false,
  domElements: {},

  // optional opts
  errorBoundary: null,
  domElementGetter: null,
  parcelCanUpdate: true, // by default, allow parcels created with single-spa-react to be updated
};

export default function singleSpaReact(userOpts) {
  // == 参数必须是对象传入
  if (typeof userOpts !== "object") {
    throw new Error(`single-spa-react requires a configuration object`);
  }

  const opts = {
    ...defaultOpts,
    ...userOpts,
  };

  // == React 参数必须
  if (!opts.React) {
    throw new Error(`single-spa-react must be passed opts.React`);
  }

  // == ReactDOM 参数必须
  if (!opts.ReactDOM) {
    throw new Error(`single-spa-react must be passed opts.ReactDOM`);
  }

  // == rootComponent 和 loadRootComponent 参数必须存在一个
  if (!opts.rootComponent && !opts.loadRootComponent) {
    throw new Error(
      `single-spa-react must be passed opts.rootComponent or opts.loadRootComponent`
    );
  }

  // == errorBoundary 参数存在的话必须为 function
  if (opts.errorBoundary && typeof opts.errorBoundary !== "function") {
    throw Error(
      `The errorBoundary opt for single-spa-react must either be omitted or be a function that returns React elements`
    );
  }

  // == 创建一个全局的 React Context 
  if (!SingleSpaContext && opts.React.createContext) {
    SingleSpaContext = opts.React.createContext();
  }

  // == 最终返回一个对象：包含 bootstrap、mount、unmount 方法
  const lifecycles = {
    bootstrap: bootstrap.bind(null, opts),
    mount: mount.bind(null, opts),
    unmount: unmount.bind(null, opts),
  };

  // == update 方法是可配置的
  if (opts.parcelCanUpdate) {
    lifecycles.update = update.bind(null, opts);
  }

  return lifecycles;
}

// == 有 loadRootComponent 的话执行，确保有 rootComponent 属性
function bootstrap(opts, props) {
  if (opts.rootComponent) {
    // This is a class or stateless function component
    return Promise.resolve();
  } else {
    // They passed a promise that resolves with the react component. Wait for it to resolve before mounting
    return opts.loadRootComponent(props).then((resolvedComponent) => {
      opts.rootComponent = resolvedComponent;
    });
  }
}

// == 主要是渲染 React
function mount(opts, props) {
  return new Promise((resolve, reject) => {
    // == React 大于 16 版本的情况
    if (
      !opts.suppressComponentDidCatchWarning &&
      atLeastReact16(opts.React) &&
      !opts.errorBoundary
    ) {
      if (!opts.rootComponent.prototype) {
        // == rootComponent 不是函数组件报错
        console.warn(
          `single-spa-react: ${
            props.name || props.appName || props.childAppName
          }'s rootComponent does not implement an error boundary.  If using a functional component, consider providing an opts.errorBoundary to singleSpaReact(opts).`
        );
      } else if (!opts.rootComponent.prototype.componentDidCatch) {
        // == rootComponent 是函数组件，但是没有 componentDidCatch 报错
        console.warn(
          `single-spa-react: ${
            props.name || props.appName || props.childAppName
          }'s rootComponent should implement componentDidCatch to avoid accidentally unmounting the entire single-spa application.`
        );
      }
    }

    // == 容器根节点，没有则创建
    const domElementGetter = chooseDomElementGetter(opts, props);

    // == 传入的 domElement 或者 domElementGetter 必须为一个函数
    if (typeof domElementGetter !== "function") {
      throw new Error(
        `single-spa-react: the domElementGetter for react application '${
          props.appName || props.name
        }' is not a function`
      );
    }

    const whenFinished = function () {
      resolve(this);
    };

    // == 拿到 React 创建的 rootComponent
    const elementToRender = getElementToRender(opts, props);
    // == 容器根节点，没有则创建
    const domElement = getRootDomEl(domElementGetter, props);
    // == 渲染 rootComponent 到 容器根节点
    const renderedComponent = reactDomRender({
      elementToRender,
      domElement,
      whenFinished,
      opts,
    });
    opts.domElements[props.name] = domElement;
  });
}

// == 主要是卸载 React 生成的 dom 节点
function unmount(opts, props) {
  return Promise.resolve().then(() => {
    opts.ReactDOM.unmountComponentAtNode(opts.domElements[props.name]);
    delete opts.domElements[props.name];
  });
}

function update(opts, props) {
  return new Promise((resolve, reject) => {
    const whenFinished = function () {
      resolve(this);
    };

    const elementToRender = getElementToRender(opts, props);
    const renderedComponent = reactDomRender({
      elementToRender,
      domElement: opts.domElements[props.name],
      whenFinished,
      opts,
    });
  });
}

// == 确保 React 大于 16 版本
function atLeastReact16(React) {
  if (
    React &&
    typeof React.version === "string" &&
    React.version.indexOf(".") >= 0
  ) {
    const majorVersionString = React.version.slice(
      0,
      React.version.indexOf(".")
    );
    try {
      return Number(majorVersionString) >= 16;
    } catch (err) {
      return false;
    }
  } else {
    return false;
  }
}

// == dom 属性优先级：domElement -> domElementGetter -> 不传入 dom 节点则重新创建一个节点
function chooseDomElementGetter(opts, props) {
  props = props && props.customProps ? props.customProps : props;
  if (props.domElement) {
    return () => props.domElement;
  } else if (props.domElementGetter) {
    return props.domElementGetter;
  } else if (opts.domElementGetter) {
    return opts.domElementGetter;
  } else {
    return defaultDomElementGetter(props);
  }
}

// == 不传入 dom 节点则重新创建一个节点
function defaultDomElementGetter(props) {
  const appName = props.appName || props.name;
  // == appName 或 name 至少有一个要存在
  if (!appName) {
    throw Error(
      `single-spa-react was not given an application name as a prop, so it can't make a unique dom element container for the react application`
    );
  }
  const htmlId = `single-spa-application:${appName}`;

  // == 返回创建一个新的 dom
  return function defaultDomEl() {
    let domElement = document.getElementById(htmlId);
    if (!domElement) {
      domElement = document.createElement("div");
      domElement.id = htmlId;
      document.body.appendChild(domElement);
    }

    return domElement;
  };
}

// == 拿到 React 创建的 rootComponent
function getElementToRender(opts, props) {
  // == 调用 createElement 创建 rootComponent
  const rootComponentElement = opts.React.createElement(
    opts.rootComponent,
    props
  );

  // == 传入全局的 Context
  let elementToRender = SingleSpaContext
    ? opts.React.createElement(
        SingleSpaContext.Provider,
        { value: props },
        rootComponentElement
      )
    : rootComponentElement;

  // caughtError、caughtErrorInfo、componentDidCatch
  if (opts.errorBoundary) {
    opts.errorBoundaryClass =
      opts.errorBoundaryClass || createErrorBoundary(opts);
    elementToRender = opts.React.createElement(
      opts.errorBoundaryClass,
      props,
      elementToRender
    );
  }

  return elementToRender;
}

// == 容器根节点，没有则创建
function getRootDomEl(domElementGetter, props) {
  const el = domElementGetter(props);
  if (!el) {
    throw new Error(
      `single-spa-react: domElementGetter function for application '${
        props.appName || props.name
      }' did not return a valid dom element. Please pass a valid domElement or domElementGetter via opts or props`
    );
  }

  return el;
}

// == 渲染 rootComponent 到 容器根节点
function reactDomRender({ opts, elementToRender, domElement, whenFinished }) {
  if (opts.renderType === "createRoot") {
    return opts.ReactDOM.createRoot(domElement).render(
      elementToRender,
      whenFinished
    );
  }

  if (opts.renderType === "createBlockingRoot") {
    return opts.ReactDOM.createBlockingRoot(domElement).render(
      elementToRender,
      whenFinished
    );
  }

  if (opts.renderType === "hydrate") {
    return opts.ReactDOM.hydrate(elementToRender, domElement, whenFinished);
  }
  
  // default to this if 'renderType' is null or doesn't match the other options
  // == 默认渲染类型
  return opts.ReactDOM.render(elementToRender, domElement, whenFinished);
}

// getElementToRender -> caughtError、caughtErrorInfo、componentDidCatch
function createErrorBoundary(opts) {
  // Avoiding babel output for class syntax and super()
  // to avoid bloat
  function SingleSpaReactErrorBoundary(props) {
    // super
    opts.React.Component.apply(this, arguments);

    this.state = {
      caughtError: null,
      caughtErrorInfo: null,
    };

    SingleSpaReactErrorBoundary.displayName = `SingleSpaReactErrorBoundary(${props.name})`;
  }

  // == 保证原型对象不会传递
  SingleSpaReactErrorBoundary.prototype = Object.create(
    opts.React.Component.prototype
  );
  // === SingleSpaReactErrorBoundary.prototype.constructor = SingleSpaReactErrorBoundary

  // == caughtError、caughtErrorInfo
  SingleSpaReactErrorBoundary.prototype.render = function () {
    if (this.state.caughtError) {
      return opts.errorBoundary(
        this.state.caughtError,
        this.state.caughtErrorInfo,
        this.props
      );
    } else {
      return this.props.children;
    }
  };

  // == componentDidCatch
  SingleSpaReactErrorBoundary.prototype.componentDidCatch = function (
    err,
    info
  ) {
    this.setState({
      caughtError: err,
      caughtErrorInfo: info,
    });
  };

  return SingleSpaReactErrorBoundary;
}
