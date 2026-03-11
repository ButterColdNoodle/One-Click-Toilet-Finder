if("serviceWorker" in navigator){
    navigator.serviceWorker.register('sw.js').then(register =>{
        console.log("SW Registered!");
        console.log(registration);
    }).catch(error =>{
        console.log("SW Registeration Failed!");
        console.log("error");
    })
}