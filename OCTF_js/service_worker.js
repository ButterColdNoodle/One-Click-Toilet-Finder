if("serviceWorker" in navigator){
    navigator.serviceWorker.register('/One-Click-Toilet-Finder/sw.js').then(registration =>{
        console.log("SW Registered!");
        console.log(registration);
    }).catch(error =>{
        console.log("SW Registeration Failed!");
        console.log(error);
    })
}