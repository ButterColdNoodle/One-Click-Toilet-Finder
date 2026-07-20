// 1. 使用 Leaflet 请求并持续监听用户当前位置；
// 2. 把最新经纬度保存到 myLocation；
// 3. 定位成功时移动用户 marker；
// 4. 定位失败时给用户反馈；
// 5. 第一次定位成功后启动附近厕所查询；
// 6. 获取手机朝向，并让用户箭头跟随旋转。


// 保存用户最新位置
// latitude：纬度
// longitude：经度
let myLocation = {
  latitude: null,
  longitude: null
};


// 保存 Leaflet 地图对象
// 地图第一次创建后会存到这里，避免重复创建
let map = null;


// 保存用户当前位置的 marker
// 第一次定位时创建，之后只移动原来的 marker
let userMarker = null;


// 创建用户位置的自定义箭头图标
const user_icon = L.divIcon({
  // Leaflet 图标最外层的 CSS class
  className: "user_icon",

  // 图标内部真正显示和旋转的箭头
  html: `
    <div class="user_arrow"></div>
  `,

  // 与 CSS 中的箭头宽高一致
  iconSize: [22, 30],

  // 让用户坐标对应箭头中心
  iconAnchor: [11, 15]
});


// 保存当前页面运行期间已经显示过的厕所
// Set 用来保存不重复的数据
let knownToilets = new Set();


// 记录厕所查询是否已经启动
// 防止每次用户位置更新时都创建新的定时查询
let toiletSearchStarted = false;


// 保存获得的用户手机方向角
//
// 0   = 北
// 90  = 东
// 180 = 南
// 270 = 西
let userDirection = null;


// 记录方向监听是否已经启动
// 防止重复添加相同的方向事件监听
let directionListeningStarted = false;



// 初始化地图
// 负责创建 Leaflet 地图、加载底图和绑定定位事件
function initMap() {
  // 如果地图已经创建过，直接返回已有地图
  if (map) {
    return map;
  }

  // 创建 Leaflet 地图
  // zoomControl: false 隐藏默认的放大和缩小按钮
  map = L.map("map", {
    zoomControl: false
  });

  // 加载 CARTO 无标签底图
  L.tileLayer(
    "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,

      // 地图来源署名，不能删除
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  ).addTo(map);

  // Leaflet 成功获得用户位置时执行
  map.on("locationfound", onLocationFound);

  // Leaflet 获取用户位置失败时执行
  map.on("locationerror", onLocationError);

  return map;
}



// 在地图上创建或移动用户当前位置 marker
function showUserOnMap(latitude, longitude) {
  const userPosition = [latitude, longitude];

  // 如果用户 marker 已经存在
  // 只移动原来的 marker，不重新创建
  if (userMarker) {
    userMarker.setLatLng(userPosition);
  } else {
    // 第一次获得位置时创建用户 marker
    userMarker = L.marker(userPosition, {
      icon: user_icon
    }).addTo(map);

    /*
      如果方向传感器比定位更早获得了方向，
      marker 创建后立即旋转一次箭头。
    */
    userArrowRotate();

    // 只在第一次定位时把地图移动到用户位置
    map.setView(userPosition, 16);

    // 避免地图出现灰块或显示不完整
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }

  // 更新用户 marker 的位置
userMarker.setLatLng([
  latitude,
  longitude
]);

// 让用户箭头始终保持在地图中心
map.setView(
  [latitude, longitude],
  //保持当前缩放等级
  map.getZoom(),
  {
    //表示直接跟随位置，避免 GPS 更新较频繁时地图反复播放移动动画
    animate: false
  }
);
}



// 开始持续监听用户位置
function locateUser() {
  // 先初始化地图
  initMap();

  // 检查浏览器是否支持定位
  if (!navigator.geolocation) {
    alert(
      "This browser does not support location services."
    );

    return;
  }

  // 使用 Leaflet 的定位功能
  map.locate({
    // 持续监听用户位置
    watch: true,

    // 不让 Leaflet 每次更新位置时移动地图中心
    setView: false,

    // 尽量使用高精度定位
    enableHighAccuracy: true,

    // 每次定位最多等待 10 秒
    timeout: 10000,

    // 不使用以前缓存的位置
    maximumAge: 0
  });
}



// Leaflet 成功获得位置时执行
function onLocationFound(event) {
  // 保存最新纬度
  myLocation.latitude = event.latlng.lat;

  // 保存最新经度
  myLocation.longitude = event.latlng.lng;

  // 创建或移动用户 marker
  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude
  );

  // 厕所查询只启动一次
  if (!toiletSearchStarted) {
    toiletSearchStarted = true;

    loadNearbyToilets();
  }
}



// Leaflet 定位失败时执行
function onLocationError(error) {
  // 在控制台显示详细错误
  console.warn("Location error:", error);

  // 给用户显示简单提示
  alert(
    "Unable to get your location.\n" +
    "Please allow location access and try again."
  );
}



// 获得用户手机朝向
//
// event 是浏览器触发方向事件时，
// 自动传入这个函数的数据。
function userDirectionGet(event) {
  // iOS 和 Android 获得朝向的方法不太一样
  if (deviceTyp === "ios") {
    // iOS 给出的值已经是顺时针指南针方向
    userDirection = event.webkitCompassHeading;
  }

  else if (deviceTyp === "android") {
    /*
      Android 的 alpha 方向和指南针方向相反。

      因此使用：
      360 - alpha
    */
    userDirection =
      (360 - event.alpha) % 360;
  }

  else {
    // 桌面设备或未知设备不处理方向
    return;
  }

  // 暂时在控制台显示获得的方向
  console.log(
    "User direction:",
    userDirection
  );

  // 获得新方向后旋转用户箭头
  userArrowRotate();
}



// 根据 userDirection 旋转地图上的用户箭头
function userArrowRotate() {
  // 用户位置 marker 还没有建立时不能旋转
  if (!userMarker) {
    return;
  }

  // 还没有获得手机方向时不能旋转
  if (userDirection == null) {
    return;
  }

  // 获得 Leaflet 创建的 marker HTML 元素
  const userMarkerElement =
    userMarker.getElement();

  // marker 元素还没有显示在地图上时停止
  if (!userMarkerElement) {
    return;
  }

  // 在用户 marker 里面找到真正的箭头元素
  const userArrowElement =
    userMarkerElement.querySelector(
      ".user_arrow"
    );

  // 找不到箭头元素时停止
  if (!userArrowElement) {
    return;
  }

  // 根据手机方向角度旋转箭头
  userArrowElement.style.transform =
    `rotate(${userDirection}deg)`;
}



// 开始监听手机方向
async function startDeviceDirection() {
  // 已经开始监听时，不重复添加事件
  if (directionListeningStarted) {
    return;
  }

  // 浏览器不支持方向传感器
  if (!window.DeviceOrientationEvent) {
    console.warn(
      "This browser does not support device orientation."
    );

    return;
  }

  // iOS 的处理
  if (deviceTyp === "ios") {
    /*
      部分 iOS Safari 需要用户先允许
      网页读取方向传感器。
    */
    if (
      typeof DeviceOrientationEvent
        .requestPermission === "function"
    ) {
      try {
        const permission =
          await DeviceOrientationEvent
            .requestPermission();

        // 用户没有允许权限
        if (permission !== "granted") {
          console.warn(
            "Device orientation permission was denied."
          );

          return;
        }
      } catch (error) {
        console.warn(
          "Unable to request device orientation permission:",
          error
        );

        return;
      }
    }

    /*
      iOS 使用 deviceorientation。

      浏览器每次获得新方向时，
      都会执行 userDirectionGet(event)。
    */
    window.addEventListener(
      "deviceorientation",
      userDirectionGet
    );

    directionListeningStarted = true;
  }

  // Android 的处理
  else if (deviceTyp === "android") {
    /*
      Android 使用绝对方向事件。

      浏览器每次获得新方向时，
      都会执行 userDirectionGet(event)。
    */
    window.addEventListener(
      "deviceorientationabsolute",
      userDirectionGet
    );

    directionListeningStarted = true;
  }
}



// 页面 HTML 加载完成后启动功能
document.addEventListener(
  "DOMContentLoaded",
  () => {
    // 开始持续定位用户
    locateUser();

    /*
      Android 通常可以直接开始监听方向。
    */
    if (deviceTyp === "android") {
      startDeviceDirection();
    }

    /*
      iOS 的方向权限必须由点击等用户操作触发。

      用户第一次点击网页时：
      1. 申请方向权限；
      2. 开始监听方向。

      once: true 表示只执行一次。
    */
    else if (deviceTyp === "ios") {
      document.addEventListener(
        "click",
        startDeviceDirection,
        {
          once: true
        }
      );
    }
  }
);



// 页面被关闭或离开时停止持续定位
window.addEventListener(
  "pagehide",
  () => {
    if (map) {
      map.stopLocate();
    }
  }
);



// 加载附近厕所
//
// 每轮查询都会读取 myLocation 中的最新位置：
//
// 1. 先查询 node；
// 2. 等待 800 毫秒；
// 3. 再查询 way；
// 4. 只添加以前没有显示过的新厕所；
// 5. 不删除地图上已有的厕所。
async function loadNearbyToilets() {
  // 搜索半径，单位是米
  const radius = 1500;

  // 每轮查询开始时读取用户最新坐标
  const latitude = myLocation.latitude;
  const longitude = myLocation.longitude;

  // 如果还没有取得用户坐标
  // 就不发送厕所查询请求
  if (
    latitude == null ||
    longitude == null
  ) {
    return;
  }

  // 依次查询 node 和 way
  for (const type of ["node", "way"]) {
    const query = `
      [out:json][timeout:10];

      ${type}["amenity"="toilets"]
      (around:${radius},${latitude},${longitude});

      out center qt;
    `;

    // 把 Overpass 查询内容放入请求地址
    const url =
      "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(query);

    try {
      // 向 Overpass API 请求厕所数据
      const response = await fetch(url);

      // 如果服务器返回错误状态
      if (!response.ok) {
        throw new Error(
          "Overpass request failed: " +
          response.status
        );
      }

      // 把返回的 JSON 转换成 JavaScript 对象
      const data = await response.json();

      // 遍历本次查询到的所有厕所
      data.elements.forEach(toilet => {
        /*
          使用厕所类型和编号组成唯一 ID。

          例如：
          node-12345
          way-12345
        */
        const toiletId =
          toilet.type + "-" + toilet.id;

        // 如果厕所已经显示过，跳过
        if (knownToilets.has(toiletId)) {
          return;
        }

        // node 类型直接有 lat 和 lon
        // way 类型使用 center.lat 和 center.lon
        const toiletLatitude =
          toilet.lat ?? toilet.center?.lat;

        const toiletLongitude =
          toilet.lon ?? toilet.center?.lon;

        // 如果厕所没有完整坐标，跳过
        if (
          toiletLatitude == null ||
          toiletLongitude == null
        ) {
          return;
        }

        // 在地图上添加厕所 marker
        L.marker([
          toiletLatitude,
          toiletLongitude
        ]).addTo(map);

        // 记录这个厕所已经显示过
        knownToilets.add(toiletId);
      });
    } catch (error) {
      /*
        当前类型查询失败后，
        仍然继续尝试另一种类型。
      */
      console.warn(
        `Failed to load ${type} toilets:`,
        error
      );
    }

    // node 查询结束后等待 800 毫秒
    // 再开始查询 way
    if (type === "node") {
      await new Promise(resolve => {
        setTimeout(resolve, 800);
      });
    }
  }

  /*
    如果一个厕所都没有显示：
    10 秒后重新查询。

    如果已经显示了厕所：
    30 秒后重新查询。
  */
  const refreshTime =
    knownToilets.size === 0
      ? 10000
      : 30000;

  // 本轮请求完成后安排下一轮查询
  setTimeout(() => {
    loadNearbyToilets();
  }, refreshTime);
}

