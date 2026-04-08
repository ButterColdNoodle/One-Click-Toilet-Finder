if("serviceWorker" in navigator){
    navigator.serviceWorker.register('/One-Click-Toilet-Finder/sw.js').then(registration =>{
        console.log("SW Registered!");
        console.log(registration);
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