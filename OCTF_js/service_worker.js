if("serviceWorker" in navigator){
    navigator.serviceWorker.register('/One-Click-Toilet-Finder/sw.js').then(registration =>{
        console.log("SW Registered!");
        //BUG 1 Fix：主动探测更新。每次加载网页，强制去服务器看一眼 sw.js 有没有变化
        registration.update();
        
        //BUG 1 Fix：当用户把手机切出去，再切回这个应用时，再次检查更新
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                registration.update();
            }
        });
    }).catch(error =>{
        console.log("SW Registeration Failed!");
        console.log(error);
    });

    //BUG 1 Fix: 监听 Service Worker 控制权交接，并自动刷新页面让用户看到最新内容
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload(); 
    });
}