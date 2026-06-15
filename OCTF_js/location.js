// 1. 在最外层（全局）定义一个“空盒子”来装坐标
// 1. 在最外层定义“空盒子”来装坐标
let myLocation = {
    latitude: null,
    longitude: null,
    isReady: false  
};

// 2. 呼叫雷达的主函数
function locateUser() {
    if ('geolocation' in navigator) {
        // 向浏览器请求位置，并指派成功和失败的处理人
        navigator.geolocation.getCurrentPosition(onSuccess, onError);
    } else {
        alert("Please switch Browser");
    }
}

// 3. 定位成功时的处理人 (成功获取经纬度)
function onSuccess(position) {
    myLocation.latitude = position.coords.latitude;
    myLocation.longitude = position.coords.longitude;
    myLocation.isReady = true; 

    console.log("Location get!", myLocation);
    // 为了让你直观看到结果，暂时加个弹窗，以后画地图时可以删掉
    alert(`Success! latitude: ${myLocation.latitude}, longitude: ${myLocation.longitude}`);
}

// 4. 【之前漏掉的就是这里！】定位失败时的处理人
function onError(error) {
    switch(error.code) {
        case error.PERMISSION_DENIED:
            alert("You declined location permissions, so we can't help you find nearby restrooms.");
            break;
        case error.POSITION_UNAVAILABLE:
            alert("Location information unavailable");
            break;
        case error.TIMEOUT:
            alert("Location request timed out. Please check your network or try again later.");
            break;
        default:
            alert("Unknown location error");
            break;
    }
}

// ================= 绑定事件部分 =================
const locateBtn = document.getElementById('locate_Btn');

if (locateBtn) {
    locateBtn.addEventListener('click', () => {
        console.log("location scan start"); 
        locateUser(); 
    });
}