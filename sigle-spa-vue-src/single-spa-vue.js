import "css.escape";

// == 默认配置
const defaultOpts = {
  // required opts
  Vue: null,
  appOptions: null,
  template: null
};

export default function singleSpaVue(userOpts) {
  // == 参数必须是对象传入
  if (typeof userOpts !== "object") {
    throw new Error(`single-spa-vue requires a configuration object`);
  }

  const opts = {
    ...defaultOpts,
    ...userOpts
  };

  // == Vue 参数必须
  if (!opts.Vue) {
    throw Error("single-spa-vue must be passed opts.Vue");
  }

  // == appOptions 参数必须
  if (!opts.appOptions) {
    throw Error("single-spa-vue must be passed opts.appOptions");
  }

  // == appOptions 的 el 存在的话必须为 HTMLElement
  if (
    opts.appOptions.el &&
    typeof opts.appOptions.el !== "string" &&
    !(opts.appOptions.el instanceof HTMLElement)
  ) {
    throw Error(
      `single-spa-vue: appOptions.el must be a string CSS selector, an HTMLElement, or not provided at all. Was given ${typeof opts
        .appOptions.el}`
    );
  }

  // Just a shared object to store the mounted object state
  // key - name of single-spa app, since it is unique
  let mountedInstances = {};

  // == 最终返回一个对象：包含 bootstrap、mount、unmount、update 方法
  return {
    bootstrap: bootstrap.bind(null, opts, mountedInstances),
    mount: mount.bind(null, opts, mountedInstances),
    unmount: unmount.bind(null, opts, mountedInstances),
    update: update.bind(null, opts, mountedInstances)
  };
}

// == 有 loadRootComponent 的话执行，确保有 rootComponent 属性
function bootstrap(opts) {
  // == loadRootComponent => rootComponent
  if (opts.loadRootComponent) {
    return opts.loadRootComponent().then(root => (opts.rootComponent = root));
  } else {
    return Promise.resolve();
  }
}

// == 主要是实例化 vue
function mount(opts, mountedInstances, props) {
  const instance = {};
  return Promise.resolve().then(() => {
    // == appOptions 规划化处理：domElement 属性在的话，即保证 appOptions 有 el 属性
    const appOptions = { ...opts.appOptions };
    if (props.domElement && !appOptions.el) {
      appOptions.el = props.domElement;
    }

    let domEl;
    if (appOptions.el) {
      // == 有 el 配置项：需要看页面是否存在此 dom
      if (typeof appOptions.el === "string") {
        // == el 为字符串：直接拿到 id
        domEl = document.querySelector(appOptions.el);
        if (!domEl) {
          throw Error(
            `If appOptions.el is provided to single-spa-vue, the dom element must exist in the dom. Was provided as ${appOptions.el}`
          );
        }
      } else {
        // == el 为对象：取出 id 属性值
        domEl = appOptions.el;
        if (!domEl.id) {
          domEl.id = `single-spa-application:${props.name}`;
        }
        appOptions.el = `#${CSS.escape(domEl.id)}`;
      }
    } else {
      // == 没有 el 配置项：那就创建 dom
      const htmlId = `single-spa-application:${props.name}`;
      appOptions.el = `#${CSS.escape(htmlId)}`;
      domEl = document.getElementById(htmlId);
      if (!domEl) {
        domEl = document.createElement("div");
        domEl.id = htmlId;
        document.body.appendChild(domEl);
      }
    }

    // == appOptions 的 el 属性值上包含 .single-spa-container 
    appOptions.el = appOptions.el + " .single-spa-container";

    // single-spa-vue@>=2 always REPLACES the `el` instead of appending to it.
    // We want domEl to stick around and not be replaced. So we tell Vue to mount
    // into a container div inside of the main domEl
    if (!domEl.querySelector(".single-spa-container")) {
      // == 此容器 dom 是放入 body 之后的
      const singleSpaContainer = document.createElement("div");
      singleSpaContainer.className = "single-spa-container";
      domEl.appendChild(singleSpaContainer);
    }

    instance.domEl = domEl;

    // == render 和 template 都没有， 但是 rootComponent 有
    if (!appOptions.render && !appOptions.template && opts.rootComponent) {
      appOptions.render = h => h(opts.rootComponent);
    }

    // == 保证 data 参数有
    if (!appOptions.data) {
      appOptions.data = {};
    }

    appOptions.data = { ...appOptions.data, ...props };

    // == 实例化 Vue
    instance.vueInstance = new opts.Vue(appOptions);
    if (instance.vueInstance.bind) {
      instance.vueInstance = instance.vueInstance.bind(instance.vueInstance);
    }

    mountedInstances[props.name] = instance;

    // == 返回 Vue 实例
    return instance.vueInstance;
  });
}

function update(opts, mountedInstances, props) {
  return Promise.resolve().then(() => {
    const instance = mountedInstances[props.name];
    const data = {
      ...(opts.appOptions.data || {}),
      ...props
    };
    for (let prop in data) {
      instance.vueInstance[prop] = data[prop];
    }
  });
}

// == 主要是卸载 vue 生成的 dom 节点
function unmount(opts, mountedInstances, props) {
  return Promise.resolve().then(() => {
    const instance = mountedInstances[props.name];
    // == 调用 vue 的 $destroy 方法
    instance.vueInstance.$destroy();
    // == $el 挂载空元素
    instance.vueInstance.$el.innerHTML = "";
    // == 删除 vue 实例
    delete instance.vueInstance;

    // == 删除实例上的 domEl 属性
    if (instance.domEl) {
      instance.domEl.innerHTML = "";
      delete instance.domEl;
    }
  });
}
