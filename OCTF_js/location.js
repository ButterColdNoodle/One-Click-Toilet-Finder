/*
One-Click Toilet Finder

WC 按钮：
筛选直线最近的五个厕所
→ 比较步行距离
→ 将成功取得路线的厕所中距离最短者，
  连同已有路线交给通用导航函数。

点击厕所 marker：
将对应厕所交给通用导航函数
→ 根据当前位置和厕所坐标请求路线。

通用导航函数：
恢复上一个目的地的 marker
→ 清除旧路线
→ 保存新目的地
→ 放大新目的地
→ 取得路线
→ 绘制路线并初始化导航进度
→ 显示时间和距离，安排下一次更新。

定时更新：
根据最新位置请求当前目的地的路线
→ 只更新时间和距离
→ 根据新时间安排下一次更新。

依赖：
- Leaflet
- index.html 中已有的 deviceTyp
- remaining_time 和 remaining_distance 元素
*/


// ========================================
// 1. 基础数据
// ========================================

// 用户最新位置
let myLocation = {
  latitude: null,
  longitude: null
};

// 地图与用户 marker
let map = null;
let userMarker = null;

// 已经显示过的厕所 ID，避免重复添加
let knownToilets = new Set();

// 保存厕所的 ID、marker 和经纬度
let toiletMarkers = [];

// 避免重复启动厕所查询循环
let toiletSearchStarted = false;

// 当前目的地
let selectedToilet = null;

// 当前导航路线
let routeLine = null;

// 当前路线数据和导航进度
let navigation = null;

// 保存下一次更新时间和距离的任务
let remainingTimer = null;

// 防止路线请求的版本号
let navVersion = 0;


// ========================================
// 2. 用户与厕所图标
// ========================================

const user_icon = L.divIcon({
  className: "user_icon",
  html: '<div class="user_arrow"></div>',
  iconSize: [22, 30],
  iconAnchor: [11, 15]
});

// 普通厕所图标
const toiletIcon = new L.Icon.Default();

// 目的地图标：普通蓝色图标放大约 1.5 倍
const bigToiletIcon = new L.Icon.Default({
  iconSize: [38, 62],
  iconAnchor: [19, 62],
  popupAnchor: [1, -52],
  shadowSize: [62, 62]
});

// 绿色图标仅用于测试直线最近的五个厕所
const greenToiletSvg =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="25" height="41" viewBox="0 0 25 41">' +
    '<path d="M12.5 1 ' +
    'C6.15 1 1 6.15 1 12.5 ' +
    'C1 21.5 12.5 39.5 12.5 39.5 ' +
    'C12.5 39.5 24 21.5 24 12.5 ' +
    'C24 6.15 18.85 1 12.5 1 Z" ' +
    'fill="#20a83e" stroke="#ffffff" stroke-width="2"/>' +
    '<circle cx="12.5" cy="12.5" r="4.5" fill="#ffffff"/>' +
    '</svg>'
  );

const greenToiletIcon = L.icon({
  iconUrl: greenToiletSvg,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});


// ========================================
// 3. 手机方向数据
// ========================================

// 0° 北、90° 东、180° 南、270° 西
let userDirection = null;

// 上一次方向
let lastDirection = null;

// 累计旋转角度，允许超过 360°
let userRotate = 0;

// 避免重复注册方向监听
let directionListeningStarted = false;


// ========================================
// 4. 初始化地图
// ========================================

function initMap() {
  if(map) {
    return map;
  }

  map = L.map("map", {
    zoomControl: false
  });

  // CARTO 底图访问 Key
  const cartoKey = "cb1_33jk_1_df8dff39b97074f2c6653f53";

  // 加载浅色、无文字底图
  L.tileLayer(
    "https://a.basemaps.cartocdn.com/light_nolabels/" +
    "{z}/{x}/{y}{r}.png?key=" +
    encodeURIComponent(cartoKey),
    {
      maxZoom: 19,

      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">' +
        'OpenStreetMap</a> contributors, ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  ).addTo(map);

  map.on("locationfound", onLocationFound);

  return map;
}


// ========================================
// 5. 显示用户位置
// ========================================

function showUserOnMap(latitude, longitude) {
  const position = [latitude, longitude];

  if(userMarker) {
    userMarker.setLatLng(position);
  } else {
    userMarker = L.marker(position, {
      icon: user_icon
    }).addTo(map);

    userArrowRotate();

    map.setView(position, 16);

    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }

  // 地图跟随用户位置
  map.setView(
    position,
    map.getZoom(),
    {
      animate: false
    }
  );
}


// ========================================
// 6. 持续定位
// ========================================

function locateUser() {
  initMap();

  map.locate({
    watch: true,
    setView: false,
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

function onLocationFound(event) {
  myLocation.latitude = event.latlng.lat;
  myLocation.longitude = event.latlng.lng;

  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude
  );

  /*
  没有指南针方向时，
  使用 GPS 提供的移动方向。
  */
  if(
    userDirection == null &&
    Number.isFinite(event.heading) &&
    event.speed > 0.5
  ) {
    userDirection = event.heading;
    userArrowRotate();

    // 不把 GPS 方向保存为指南针方向
    userDirection = null;
  }

  // 首次获得位置后，启动附近厕所查询
  if(!toiletSearchStarted) {
    toiletSearchStarted = true;
    loadNearbyToilets();
  }
}


// ========================================
// 7. 获取手机方向
// ========================================

function userDirectionGet(event) {
  if(deviceTyp === "ios") {
    if(event.webkitCompassHeading == null) {
      return;
    }

    userDirection = event.webkitCompassHeading;
  } else if(deviceTyp === "android") {
    // 使用相对于地球坐标的绝对方向
    if(event.absolute !== true) {
      return;
    }

    if(event.alpha == null) {
      return;
    }

    userDirection = (360 - event.alpha) % 360;
  } else {
    return;
  }

  // 根据屏幕旋转角度修正横屏方向
  const screenAngle = screen.orientation?.angle || 0;

  userDirection =
    (userDirection + screenAngle + 360) % 360;

  userArrowRotate();
}


// ========================================
// 8. 平滑旋转箭头
// ========================================

function userArrowRotate() {
  if(!userMarker || userDirection == null) {
    return;
  }

  const markerElement = userMarker.getElement();

  if(!markerElement) {
    return;
  }

  const arrowElement =
    markerElement.querySelector(".user_arrow");

  if(!arrowElement) {
    return;
  }

  if(lastDirection == null) {
    userRotate = userDirection;
  } else {
    let change = userDirection - lastDirection;

    // 359° → 0° 只旋转 1°
    if(change < -180) {
      change += 360;
    } else if(change > 180) {
      change -= 360;
    }

    userRotate += change;
  }

  lastDirection = userDirection;

  arrowElement.style.transform =
    "rotate(" + userRotate + "deg)";
}


// ========================================
// 9. 开始监听方向
// ========================================

async function startDeviceDirection() {
  if(directionListeningStarted) {
    return;
  }

  if(!window.DeviceOrientationEvent) {
    return;
  }

  if(deviceTyp === "ios") {
    // iOS 方向权限需要在用户点击时请求
    if(
      typeof DeviceOrientationEvent.requestPermission
      === "function"
    ) {
      const permission =
        await DeviceOrientationEvent.requestPermission();

      if(permission !== "granted") {
        return;
      }
    }

    window.addEventListener(
      "deviceorientation",
      userDirectionGet
    );

    directionListeningStarted = true;
  } else if(deviceTyp === "android") {
    window.addEventListener(
      "deviceorientationabsolute",
      userDirectionGet
    );

    directionListeningStarted = true;
  }
}


// ========================================
// 10. 查询附近厕所并绑定点击事件
// ========================================

async function loadNearbyToilets() {
  const radius = 1500;

  const latitude = myLocation.latitude;
  const longitude = myLocation.longitude;

  // 分别查询 node 和 way 厕所
  for(const type of ["node", "way"]) {
    try {
      const query =
        "[out:json][timeout:10];" +
        type + '["amenity"="toilets"]' +
        "(around:" + radius + "," +
        latitude + "," + longitude + ");" +
        "out center qt;";

      const url =
        "https://overpass-api.de/api/interpreter?data=" +
        encodeURIComponent(query);

      const response = await fetch(url);

      /*
      先检查 HTTP 状态。
      → 504 等失败响应不再直接作为 JSON 解析。
      */
      if(!response.ok) {
        throw new Error("Overpass HTTP " + response.status);
      }

      const data = await response.json();

      if(!Array.isArray(data.elements)) {
        throw new Error("Overpass elements missing");
      }

      for(const toilet of data.elements) {
        const toiletId =
          toilet.type + "-" + toilet.id;

        // 已经添加过的厕所不重复添加
        if(knownToilets.has(toiletId)) {
          continue;
        }

        const toiletLatitude =
          toilet.lat ?? toilet.center?.lat;

        const toiletLongitude =
          toilet.lon ?? toilet.center?.lon;

        // 没有坐标的厕所不创建标记
        if(
          toiletLatitude == null ||
          toiletLongitude == null
        ) {
          continue;
        }

        const marker = L.marker(
          [toiletLatitude, toiletLongitude],
          {
            icon: toiletIcon
          }
        ).addTo(map);

        /*
        把同一个厕所的信息放在一个对象中。
        → ID、marker 和经纬度建立对应关系。
        */
        const toiletData = {
          id: toiletId,
          marker,
          latitude: toiletLatitude,
          longitude: toiletLongitude
        };

        toiletMarkers.push(toiletData);

        /*
        点击 marker 后，
        把对应厕所交给通用导航函数。
        */
        marker.on("click", () => {
          navigateToToilet(toiletData);
        });

        knownToilets.add(toiletId);
      }
    } catch(error) {
      /*
      当前类型查询失败时不显示提示。
      → 继续查询另一种类型。
      → 本轮结束后仍安排下一轮查询。
      */
    }

    // 两次查询之间间隔 800 毫秒
    if(type === "node") {
      await new Promise(resolve => {
        setTimeout(resolve, 800);
      });
    }
  }

  // 保留原来的厕所刷新间隔
  const refreshTime =
    knownToilets.size === 0 ? 10000 : 30000;

  setTimeout(loadNearbyToilets, refreshTime);
}


// ========================================
// 11. 解码 Valhalla 路线
// ========================================

/*
Valhalla 返回的 shape 是编码后的路线。

解码后得到：
[
  [纬度, 经度],
  [纬度, 经度],
  ...
]

这些坐标交给 L.polyline() 绘制路线。
*/

function decodePolyline6(shape) {
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const points = [];

  // 读取一个经度或纬度的变化值
  function readNumber() {
    let value = 0;
    let shift = 0;
    let byte;

    do {
      byte = shape.charCodeAt(index++) - 63;

      value += (byte & 31) * 2 ** shift;
      shift += 5;
    } while(byte >= 32);

    return value % 2
      ? -(value + 1) / 2
      : value / 2;
  }

  while(index < shape.length) {
    latitude += readNumber();
    longitude += readNumber();

    points.push([
      latitude / 1e6,
      longitude / 1e6
    ]);
  }

  return points;
}


// ========================================
// 12. 请求一个厕所的步行路线
// ========================================

/*
接收：
- 用户位置 startPosition
- 目的地厕所 toilet

返回：
- 步行距离 walkingDistance，单位米
- 预计时间 walkingTime，单位秒
- 路线坐标 points
*/

async function getWalkingDistance(startPosition, toilet) {
  const requestData = {
    locations: [
      {
        lat: startPosition.latitude,
        lon: startPosition.longitude
      },
      {
        lat: toilet.latitude,
        lon: toilet.longitude
      }
    ],

    costing: "pedestrian",
    units: "kilometers"
  };

  const url =
    "https://valhalla1.openstreetmap.de/route?json=" +
    encodeURIComponent(JSON.stringify(requestData));

  const response = await fetch(url, {
    method: "GET",

    headers: {
      "X-Client-Id":
        "buttercoldnoodle.github.io/One-Click-Toilet-Finder"
    }
  });

  // 请求失败时，不直接解析错误响应
  if(!response.ok) {
    throw new Error("Valhalla HTTP " + response.status);
  }

  const data = await response.json();

  const length = data.trip?.summary?.length;
  const walkingTime = data.trip?.summary?.time;
  const shape = data.trip?.legs?.[0]?.shape;

  // 确认返回的数据包含距离、时间和路线
  if(
    !Number.isFinite(length) ||
    length < 0 ||
    !Number.isFinite(walkingTime) ||
    walkingTime < 0 ||
    typeof shape !== "string" ||
    shape.length === 0
  ) {
    throw new Error("Valhalla route missing");
  }

  return {
    walkingDistance: length * 1000,
    walkingTime,
    points: decodePolyline6(shape)
  };
}


// ========================================
// 13. WC 按钮筛选最近厕所
// ========================================

/*
先计算直线距离
→ 取最近的五个厕所
→ 分别请求步行路线
→ 比较成功取得的路线
→ 把最短距离的厕所和路线交给通用导航函数。
*/

async function findBestToilet() {
  // 尚未查到厕所时，不开始比较
  if(toiletMarkers.length === 0) {
    return;
  }

  const locNavVersion = ++navVersion;

  // 比较期间，五个厕所使用同一个起点
  const startPosition = {
    latitude: myLocation.latitude,
    longitude: myLocation.longitude
  };

  // 计算各厕所到用户的直线距离
  const nearestFive = toiletMarkers
    .map(toilet => {
      return {
        ...toilet,

        straightDistance: map.distance(
          [
            startPosition.latitude,
            startPosition.longitude
          ],
          [
            toilet.latitude,
            toilet.longitude
          ]
        )
      };
    })
    .sort((a, b) => {
      return a.straightDistance - b.straightDistance;
    })
    .slice(0, 5);

  /*
  以下代码仅测试时启用：
  将筛选出的五个厕所标为绿色。

  for(const toilet of nearestFive) {
    toilet.marker.setIcon(greenToiletIcon);
    toilet.marker.setZIndexOffset(1000);
  }
  */

  const walkingResults = [];

  // 依次请求五个厕所的步行路线
  for(const toilet of nearestFive) {
    // 用户已经进行了新的选择时，停止旧比较
    if(locNavVersion !== navVersion) {
      return;
    }

    try {
      const route = await getWalkingDistance(
        startPosition,
        toilet
      );

      // 等待请求期间发生新的选择时，忽略旧结果
      if(locNavVersion !== navVersion) {
        return;
      }

      walkingResults.push({
        ...toilet,
        route,
        walkingDistance: route.walkingDistance
      });
    } catch(error) {
      // 当前厕所请求失败，继续比较其他厕所
    }
  }

  if(locNavVersion !== navVersion) {
    return;
  }

  // 没有成功取得的路线时，不读取不存在的结果
  if(walkingResults.length === 0) {
    return;
  }

  // 按实际步行距离从小到大排序
  walkingResults.sort((a, b) => {
    return a.walkingDistance - b.walkingDistance;
  });

  const bestToilet = walkingResults[0];

  /*
  厕所和路线已经取得。
  → 交给通用导航函数。
  → 不重复请求路线。
  */
  await navigateToToilet(
    bestToilet,
    bestToilet.route,
    locNavVersion
  );
}


// ========================================
// 14. 通用导航函数
// ========================================

/*
WC 按钮和 marker 点击共用这个函数。

toilet：接收到的厕所。
route：已有路线，没有传入时默认为 null。
locNavVersion：导航版本号，用于防止旧的导航结果覆盖新的导航结果。
*/

async function navigateToToilet(
  toilet,
  route = null,
  locNavVersion = null
) {
  // 点击 marker 时，建立新的选择编号
  if(locNavVersion == null) {
    locNavVersion = ++navVersion;
  }

  // 已经过时的自动筛选结果不再使用
  if(locNavVersion !== navVersion) {
    return;
  }

  // 取消上一个目的地的定时任务
  clearTimeout(remainingTimer);
  remainingTimer = null;

  const version = ++remainingVersion;

  // 清除上一个目的地的时间和距离
  document.getElementById("remaining_time").textContent = "";
  document.getElementById("remaining_distance").textContent = "";

  // 恢复上一个目的地的 marker
  if(selectedToilet) {
    selectedToilet.marker.setIcon(toiletIcon);
    selectedToilet.marker.setZIndexOffset(0);
  }

  // 清除旧的导航路线
  if(routeLine) {
    map.removeLayer(routeLine);
  }

  routeLine = null;
  navigation = null;

  // 保存新目的地
  selectedToilet = toilet;

  // 放大新目的地
  selectedToilet.marker.setIcon(bigToiletIcon);
  selectedToilet.marker.setZIndexOffset(2000);

  try {
    /*
    WC 按钮已经取得路线时，直接使用。
    点击 marker 没有传入路线时，再请求路线。
    */
    if(route == null) {
      route = await getWalkingDistance(
        {
          latitude: myLocation.latitude,
          longitude: myLocation.longitude
        },
        toilet
      );
    }

    // 等待期间发生新的选择时，不使用旧结果
    if(
      locNavVersion !== navVersion ||
      version !== remainingVersion
    ) {
      return;
    }

    // 绘制路线并初始化导航进度
    beginNavigation(route);

    // 开始导航时立即显示时间和距离
    showRemaining(route);

    // 根据剩余时间安排下一次更新
    scheduleRemainingUpdate(
      route.walkingTime,
      toilet,
      version
    );
  } catch(error) {
    // 请求失败时不显示提示，不绘制失败的路线
  }
}


// ========================================
// 15. 绘制路线并初始化导航进度
// ========================================

function beginNavigation(route) {
  // 保存路线数据，将导航进度初始化为 0
  navigation = {
    ...route,
    progress: 0
  };

  // 使用 Leaflet 绘制路线
  routeLine = L.polyline(route.points, {
    color: "#1677ff",
    weight: 6,
    lineCap: "round",
    interactive: false
  }).addTo(map);
}


// ========================================
// 16. 显示剩余时间和距离
// ========================================

function showRemaining(route) {
  const timeElement =
    document.getElementById("remaining_time");

  const distanceElement =
    document.getElementById("remaining_distance");

  // 不足一分钟显示 <1 min
  if(route.walkingTime < 60) {
    timeElement.textContent = "<1 min";
  } else {
    // 秒换算成分钟，再向上取整
    const minutes = Math.ceil(route.walkingTime / 60);

    timeElement.textContent = "~" + minutes + " min";
  }

  // 距离四舍五入到整数米
  const meters = Math.round(route.walkingDistance);

  distanceElement.textContent = meters + " m";
}


// ========================================
// 17. 根据剩余时间安排下一次更新
// ========================================

function scheduleRemainingUpdate(seconds, toilet, version) {
  let delay;

  /*
  大于 180 秒
  → 60 秒后更新。

  大于 120 秒、不超过 180 秒
  → 30 秒后更新。

  不超过 120 秒
  → 20 秒后更新。
  */
  if(seconds > 180) {
    delay = 60000;
  } else if(seconds > 120) {
    delay = 30000;
  } else {
    delay = 20000;
  }

  remainingTimer = setTimeout(() => {
    updateRemaining(toilet, version, seconds);
  }, delay);
}


// ========================================
// 18. 根据最新位置更新时间和距离
// ========================================

async function updateRemaining(
  toilet,
  version,
  previousSeconds
) {
  // 已经切换目的地时，不执行旧的更新任务
  if(version !== remainingVersion) {
    return;
  }

  // 本次请求失败时，仍用上次时间确定更新间隔
  let seconds = previousSeconds;

  try {
    /*
    到更新时刻再读取当前位置。
    → 请求到当前目的地的步行路线。
    → 取得最新预计时间和距离。
    */
    const route = await getWalkingDistance(
      {
        latitude: myLocation.latitude,
        longitude: myLocation.longitude
      },
      toilet
    );

    // 请求期间切换了目的地时，忽略旧结果
    if(version !== remainingVersion) {
      return;
    }

    // 只更新两侧文字，不替换地图上的路线
    showRemaining(route);

    seconds = route.walkingTime;
  } catch(error) {
    // 更新失败时保留上一次显示，不显示错误提示
  } finally {
    // 当前目的地仍然有效时，继续安排下一次更新
    if(version === remainingVersion) {
      scheduleRemainingUpdate(
        seconds,
        toilet,
        version
      );
    }
  }
}


// ========================================
// 19. 页面启动与恢复
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  locateUser();

  const wcBtn = document.getElementById("wc_Btn");

  if(wcBtn) {
    wcBtn.addEventListener("click", () => {
      // iOS 通过用户点击请求方向权限
      startDeviceDirection();

      findBestToilet();
    });
  }

  if(deviceTyp === "android") {
    startDeviceDirection();
  } else if(deviceTyp === "ios") {
    document.addEventListener(
      "click",
      startDeviceDirection,
      {
        once: true
      }
    );
  }
});

// 离开页面时停止定位
window.addEventListener("pagehide", () => {
  if(map) {
    map.stopLocate();
  }
});

// 从浏览器后退缓存恢复时重新定位
window.addEventListener("pageshow", event => {
  if(event.persisted) {
    locateUser();
  }
});