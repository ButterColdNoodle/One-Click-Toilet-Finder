// 1. 在最外层（全局）定义一个“空盒子”来装坐标
let myLocation = {
    latitude: null,
    longitude: null,
    isReady: false  // 加一个状态，方便知道定位有没有成功
};

function locateUser() {
    if ('geolocation' in navigator) {
        // 发起定位
        navigator.geolocation.getCurrentPosition(onSuccess, onError);
    }
}

function onSuccess(position) {
    // 2. 定位成功！把拿到的数字塞进外面的“空盒子”里
    myLocation.latitude = position.coords.latitude;
    myLocation.longitude = position.coords.longitude;
    myLocation.isReady = true; 

    console.log("太好了，坐标已保存进变量中！", myLocation);

    // 3. 【重点】既然坐标拿到了，就可以立刻命令下一步启动了！
    // 比如在这里调用画地图的函数：
    // drawMap(myLocation.latitude, myLocation.longitude);
}

// 假设这是你应用里的另一个按钮功能
function checkMyVariables() {
    // 之后随时随地，你都可以调用这个全局变量
    if (myLocation.isReady) {
        alert(`你现在的经度是 ${myLocation.longitude}`);
    } else {
        alert(`请先点击定位按钮！`);
    }
}

// 1. 去网页上把刚才新建的定位按钮抓过来
const locateBtn = document.getElementById('locate_Btn');

// 2. 为了防止报错，先检查一下按钮是不是真的存在（严谨的习惯）
if (locateBtn) {
    // 3. 让这个按钮竖起耳朵，一旦被 'click'（点击），就去执行 locateUser 函数
    locateBtn.addEventListener('click', () => {
        // 为了方便测试，点击时先在控制台打印一句话
        console.log("定位按钮被点击了，雷达开始扫描..."); 
        // 正式呼叫定位雷达
        locateUser(); 
    });
}