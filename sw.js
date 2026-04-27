/*定义当前缓存名为‘版本号’->解决缓存污染问题*/
/*记得每次更新版本号*/
const cache_version = 'cache_0.0.30';

/*self -> ServiceWorker自身检测到安装时 （ServiceWorker首次安装或更新时触发事件）*/
self.addEventListener("install", e=>{
    //BUG 1 Fix: 强制跳过等待状态，让新版本立即进入 activate 阶段
    self.skipWaiting();
    e.waitUntil(
        /*创建/打开名为‘static_版本’的缓存[cache]*/
        caches.open(cache_version).then(cache=>{
            /*将以下资源全部加入缓存*/
            /*结合以上-> 任何一个资源下载失败，整个addAll的Promise[未来才会完成的任务]被拒绝*/
            return cache.addAll(["/One-Click-Toilet-Finder/", "/One-Click-Toilet-Finder/OCTF_css/OCTF_main.css", "/One-Click-Toilet-Finder/OCTF_images/Icon_192.png", "/One-Click-Toilet-Finder/OCTF_images/Icon_512.png"]);
        })
    );
});

/*当监听到ServiceWorker的新版本激活时*/
self.addEventListener("activate", e=>{
    //BUG 1 Fix: 声明新的 Service Worker 立即获取所有页面的控制权
    e.waitUntil(self.clients.claim());
    e.waitUntil(
        /* 获取所有缓存名称 */
        caches.keys().then((cacheNames=>{
           /* 把以下所有任务列出来，然后执行并等待它们（多个异步任务打包成一个整体任务） */ 
            return Promise.all(
                /*e在这里指event */
                cacheNames.map(cacheName=>{
                    
                    if(cacheName !== cache_version){
                        console.log('delete old cache:',cacheName);
                        return caches.delete(cacheName)
                    }
                })
            )
        }))
    )
})

/*当监听到ServiceWorker的fetch事件[发起网络请求]*/
self.addEventListener("fetch", e=>{
    /*BUG 1 Fix*/
    e.respondWith(
        // 1. 永远先尝试去网络上获取最新的文件
        fetch(e.request).then(response => {
            // 如果获取成功，顺手把最新得到的文件塞进缓存里，更新本地库
            let responseClone = response.clone();
            caches.open(cache_version).then(cache => {
                cache.put(e.request, responseClone);
            });
            return response;
        }).catch(() => {
            // 2. 只有当 fetch 报错（比如用户没网了，或者进了信号差的厕所），才从缓存里拿旧的凑合用
            return caches.match(e.request);
        })
    );
});



/*核心目的->PWA能够离线工作，提升加载速度*/

    /*安装事件  预缓存核心资源*/
        /*第一次注册->建立缓存‘cache_版本’，将一些资源加入该缓存*/

    /*激活事件  清理旧版本缓存*/
        /*更新获取所有缓存，删除非当前版本缓存*/

    /*拦截请求事件  缓存优先于网络*/
        /*之后每次页面视图发起网络请求（访问页面/加载图片/...）,ServiceWorker会拦截并执行以下*/
            /*先在static中查询匹配的响应（对应页面/图片/...）*/
                /*若找到直接返回缓存中内容 ->不依赖网络，响应更快*/
                /*若没找到转发给网络获取真实资源*/



                /*e在这里指event */
                /*return->返回，也就是输出 */
                /*promise-> 未来才会执行的任务 */
                /*.map ->将以下内容都过一遍 */