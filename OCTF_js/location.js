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
        alert("对不起，您的浏览器不支持定位功能。");
    }
}

// 3. 定位成功时的处理人 (成功获取经纬度)
function onSuccess(position) {
    myLocation.latitude = position.coords.latitude;
    myLocation.longitude = position.coords.longitude;
    myLocation.isReady = true; 

    console.log("太好了，坐标已保存进变量中！", myLocation);
    // 为了让你直观看到结果，暂时加个弹窗，以后画地图时可以删掉
    alert(`定位成功！纬度: ${myLocation.latitude}, 经度: ${myLocation.longitude}`);
}

// 4. 【之前漏掉的就是这里！】定位失败时的处理人
function onError(error) {
    switch(error.code) {
        case error.PERMISSION_DENIED:
            alert("你拒绝了定位权限，我没法帮你找附近的厕所啦。");
            break;
        case error.POSITION_UNAVAILABLE:
            alert("位置信息不可用（可能是由于信号太差）。");
            break;
        case error.TIMEOUT:
            alert("定位请求超时了，请检查网络或稍后再试。");
            break;
        default:
            alert("发生了一个未知的定位错误。");
            break;
    }
}

// ================= 绑定事件部分 =================
const locateBtn = document.getElementById('locate_Btn');

if (locateBtn) {
    locateBtn.addEventListener('click', () => {
        console.log("定位按钮被点击了，雷达开始扫描..."); 
        locateUser(); 
    });
}