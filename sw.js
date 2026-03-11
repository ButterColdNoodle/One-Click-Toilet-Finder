/*self -> ServiceWorker自身检测到安装时 （ServiceWorker首次安装或更新时触发事件）*/
self.addEventListener("install", e=>{

    e.waitUntil(
        /*创建/打开名为static的缓存[cache]*/
        caches.open("static").then(cache=>{
            /*将以下资源全部加入缓存*/
            /*结合以上-> 任何一个资源下载失败，整个addAll的Promise[未来才会完成的任务]被拒绝*/
            return cache.addAll(["./", "./OCTF_css/OCTF_main.css", "./OCTF_images/Icon_192.png", "./OCTF_images/Icon_512.png"]);
        })
    );
});

/*当监听到ServiceWorker的fetch事件[发起网络请求]*/
self.addEventListener("fetch", e=>{
    /*用后面代码替换默认网络请求*/
    e.respondWith(
        /*在ServiceWorker的fetch所有缓存中查找是否有与请求对应的响应*/
        caches.match(e.request).then(response=>{
            /*response为真[找到了响应]->直接返回  否则，发起真是网络请求并返回结果*/
            return response || fetch(e.request);
        })
    );
});

/*核心目的->PWA能够离线工作，提升加载速度*/
    /*安装事件  预缓存核心资源*/
        /*第一次注册/更新->建立缓存static，将一些资源加入该缓存*/

    /*拦截请求事件  缓存优先于网络*/
        /*之后每次页面视图发起网络请求（访问页面/加载图片/...）,ServiceWorker会拦截并执行以下*/
            /*先在static中查询匹配的响应（对应页面/图片/...）*/
                /*若找到直接返回缓存中内容 ->不依赖网络，响应更快*/
                /*若没找到转发给网络获取真实资源*/