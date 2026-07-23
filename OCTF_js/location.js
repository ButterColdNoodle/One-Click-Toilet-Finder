/*
功能：

1. 创建 Leaflet 地图；
2. 持续监听用户位置；
3. 保存用户最新坐标；
4. 移动用户箭头；
5. 让地图中心跟随用户；
6. 查询附近的 node 和 way 厕所；
7. 保存厕所 marker 和坐标；
8. 获取手机朝向并旋转用户箭头；
9. 点击 wc_Btn 后：
   - 计算所有厕所的直线距离；
   - 按距离从近到远排序；
   - 取最近的最多 5 个厕所；
   - 把这几个厕所的 marker 变成绿色。
*/


// ==============================
// 用户位置
// ==============================

// 保存用户最新位置
let myLocation = {
  latitude: null,
  longitude: null
};


// ==============================
// 地图
// ==============================

// 保存 Leaflet 地图对象
let map = null;


// ==============================
// 用户 marker
// ==============================

// 保存用户当前位置的 marker
let userMarker = null;


// 用户箭头图标
const user_icon = L.divIcon({
  className: "user_icon",

  html: `
    <div class="user_arrow"></div>
  `,

  iconSize: [22, 30],

  // 让经纬度对应箭头中心
  iconAnchor: [11, 15]
});


// ==============================
// 厕所数据
// ==============================

// 保存已经显示过的厕所 ID
// 防止重复创建相同厕所的 marker
let knownToilets = new Set();


// 保存所有厕所的：
// ID、marker、纬度、经度
let toiletMarkers = [];


// 记录厕所查询是否已经启动
// 防止每次定位更新都重新启动查询循环
let toiletSearchStarted = false;


// ==============================
// 厕所图标
// ==============================

// 普通厕所使用 Leaflet 默认蓝色 marker
const toiletIcon = new L.Icon.Default();


// 绿色厕所图标
//
// 使用 SVG 直接生成绿色 marker，
// 因此不需要额外的绿色图片或 CSS。
const greenToiletIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="25"
        height="41"
        viewBox="0 0 25 41"
      >
        <path
          d="
            M12.5 1
            C6.15 1 1 6.15 1 12.5
            C1 21.5 12.5 39.5 12.5 39.5
            C12.5 39.5 24 21.5 24 12.5
            C24 6.15 18.85 1 12.5 1
            Z
          "
          fill="#20a83e"
          stroke="#ffffff"
          stroke-width="2"
        />

        <circle
          cx="12.5"
          cy="12.5"
          r="4.5"
          fill="#ffffff"
        />
      </svg>
    `),

  // 与默认 Leaflet marker 大小相近
  iconSize: [25, 41],

  // 让 marker 底部尖端对应厕所坐标
  iconAnchor: [12, 41],

  // 以后添加 popup 时的位置
  popupAnchor: [1, -34]
});


// ==============================
// 手机方向
// ==============================

// 保存手机朝向
//
// 0°   = 北
// 90°  = 东
// 180° = 南
// 270° = 西
let userDirection = null;


// 防止重复添加方向事件监听
let directionListeningStarted = false;


// ==============================
// 初始化地图
// ==============================

function initMap() {
  // 地图已经创建时直接返回
  if (map) {
    return map;
  }

  // 创建 Leaflet 地图
  map = L.map("map", {
    // 隐藏默认缩放按钮
    zoomControl: false
  });

  // 加载 CARTO 无标签底图
  L.tileLayer(
    "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,

      attribution:
        "&copy; OpenStreetMap contributors, &copy; CARTO"
    }
  ).addTo(map);

  // 成功获得位置时执行
  map.on(
    "locationfound",
    onLocationFound
  );

  // 定位失败时执行
  map.on(
    "locationerror",
    onLocationError
  );

  return map;
}


// ==============================
// 显示用户位置
// ==============================

function showUserOnMap(
  latitude,
  longitude
) {
  const userPosition = [
    latitude,
    longitude
  ];

  // 用户 marker 已经存在
  if (userMarker) {
    // 更新原来的 marker 位置
    userMarker.setLatLng(
      userPosition
    );
  }

  // 第一次获得用户位置
  else {
    // 创建用户箭头 marker
    userMarker = L.marker(
      userPosition,
      {
        icon: user_icon
      }
    ).addTo(map);

    /*
    如果方向传感器比定位更早获得角度，
    marker 创建后立即旋转一次。
    */
    userArrowRotate();

    // 第一次定位时设置地图缩放
    map.setView(
      userPosition,
      16
    );

    // 防止地图出现灰色区域
    setTimeout(
      () => {
        map.invalidateSize();
      },
      100
    );
  }

  // 让地图中心跟随用户位置
  map.setView(
    userPosition,

    // 保持当前缩放等级
    map.getZoom(),

    {
      /*
      不播放移动动画。

      GPS 更新时地图直接移动到新位置。
      */
      animate: false
    }
  );
}


// ==============================
// 开始定位
// ==============================

function locateUser() {
  // 创建地图
  initMap();

  // 检查浏览器是否支持定位
  if (!navigator.geolocation) {
    alert(
      "This browser does not support location services."
    );

    return;
  }

  // 持续监听用户位置
  map.locate({
    // 持续获取位置
    watch: true,

    /*
    不使用 Leaflet 自带的自动居中，
    居中由 showUserOnMap() 控制。
    */
    setView: false,

    // 尽量使用高精度定位
    enableHighAccuracy: true,

    // 每次定位最多等待 10 秒
    timeout: 10000,

    // 不使用以前缓存的位置
    maximumAge: 0
  });
}


// 定位成功
function onLocationFound(event) {
  // 保存最新纬度
  myLocation.latitude =
    event.latlng.lat;

  // 保存最新经度
  myLocation.longitude =
    event.latlng.lng;

  // 创建或移动用户 marker
  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude
  );

  // 厕所查询循环只启动一次
  if (!toiletSearchStarted) {
    toiletSearchStarted = true;

    loadNearbyToilets();
  }
}


// 定位失败
function onLocationError(error) {
  console.warn(
    "Location error:",
    error
  );

  alert(
    "Unable to get your location.\n" +
    "Please allow location access and try again."
  );
}


// ==============================
// 获得手机方向
// ==============================

function userDirectionGet(event) {
  // iOS
  if (deviceTyp === "ios") {
    userDirection =
      event.webkitCompassHeading;
  }

  // Android
  else if (deviceTyp === "android") {
    userDirection =
      (360 - event.alpha) % 360;
  }

  // 桌面或其他设备不处理
  else {
    return;
  }

  console.log(
    "User direction:",
    userDirection
  );

  // 获得新方向后旋转箭头
  userArrowRotate();
}


// ==============================
// 旋转用户箭头
// ==============================

function userArrowRotate() {
  // 用户 marker 还没有创建
  if (!userMarker) {
    return;
  }

  // 还没有获得手机方向
  if (userDirection == null) {
    return;
  }

  // 获得 Leaflet marker 的 HTML 元素
  const userMarkerElement =
    userMarker.getElement();

  if (!userMarkerElement) {
    return;
  }

  // 找到 marker 内部的箭头
  const userArrowElement =
    userMarkerElement.querySelector(
      ".user_arrow"
    );

  if (!userArrowElement) {
    return;
  }

  // 根据手机方向旋转箭头
  userArrowElement.style.transform =
    `rotate(${userDirection}deg)`;
}


// ==============================
// 找到直线距离最近的五个厕所
// ==============================

function showNearestFiveToilets() {
  // 地图还没有创建
  if (!map) {
    console.warn(
      "The map is not ready yet."
    );

    return;
  }

  // 还没有获得用户位置
  if (
    myLocation.latitude == null ||
    myLocation.longitude == null
  ) {
    console.warn(
      "The user's location is not available yet."
    );

    return;
  }

  // 还没有加载到任何厕所
  if (toiletMarkers.length === 0) {
    console.warn(
      "No toilet markers are available yet."
    );

    return;
  }

  /*
  每次点击按钮时，
  先把所有厕所恢复为普通蓝色。

  这样用户移动后再次点击，
  旧的五个绿色厕所就会恢复正常。
  */
  toiletMarkers.forEach(
    toilet => {
      toilet.marker.setIcon(
        toiletIcon
      );

      toilet.marker.setZIndexOffset(
        0
      );
    }
  );

  /*
  遍历所有厕所。

  给每个厕所增加一个 distance，
  表示用户到厕所的直线距离。
  */
  const toiletsWithDistance =
    toiletMarkers.map(
      toilet => {
        const distance =
          map.distance(
            [
              myLocation.latitude,
              myLocation.longitude
            ],
            [
              toilet.latitude,
              toilet.longitude
            ]
          );

        return {
          // 保留厕所原有信息
          id: toilet.id,
          marker: toilet.marker,
          latitude: toilet.latitude,
          longitude: toilet.longitude,

          // 增加直线距离
          // map.distance() 返回米
          distance: distance
        };
      }
    );

  /*
  按照距离从小到大排序。

  距离小的厕所排在数组前面。
  */
  toiletsWithDistance.sort(
    (toiletA, toiletB) => {
      return (
        toiletA.distance -
        toiletB.distance
      );
    }
  );

  /*
  取排序后的前五个厕所。

  如果目前只有三个厕所，
  就会返回这三个，不会报错。
  */
  const nearestFive =
    toiletsWithDistance.slice(
      0,
      5
    );

  // 把最近五个厕所变成绿色
  nearestFive.forEach(
    toilet => {
      toilet.marker.setIcon(
        greenToiletIcon
      );

      /*
      提高 marker 显示层级，
      防止被附近的蓝色 marker 遮挡。
      */
      toilet.marker.setZIndexOffset(
        1000
      );
    }
  );

  // 在控制台显示完整结果
  console.log(
    "Nearest five toilets:",
    nearestFive
  );

  // 以表格形式显示厕所 ID 和距离
  console.table(
    nearestFive.map(
      toilet => {
        return {
          id: toilet.id,

          // 四舍五入为整数米
          distance:
            Math.round(
              toilet.distance
            )
        };
      }
    )
  );
}


// ==============================
// 开始监听手机方向
// ==============================

async function startDeviceDirection() {
  // 已经开始监听，不重复添加事件
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

  // iOS
  if (deviceTyp === "ios") {
    /*
    部分 iOS Safari 必须由用户点击后，
    才能请求方向传感器权限。
    */
    if (
      typeof DeviceOrientationEvent
        .requestPermission === "function"
    ) {
      try {
        const permission =
          await DeviceOrientationEvent
            .requestPermission();

        if (permission !== "granted") {
          console.warn(
            "Device orientation permission was denied."
          );

          return;
        }
      }

      catch (error) {
        console.warn(
          "Unable to request device orientation permission:",
          error
        );

        return;
      }
    }

    window.addEventListener(
      "deviceorientation",
      userDirectionGet
    );

    directionListeningStarted = true;
  }

  // Android
  else if (deviceTyp === "android") {
    window.addEventListener(
      "deviceorientationabsolute",
      userDirectionGet
    );

    directionListeningStarted = true;
  }
}


// ==============================
// 页面启动
// ==============================

document.addEventListener(
  "DOMContentLoaded",
  () => {
    // 开始定位用户
    locateUser();

    // 获得寻找厕所按钮
    const wcBtn =
      document.getElementById(
        "wc_Btn"
      );

    // 按钮存在时添加点击事件
    if (wcBtn) {
      wcBtn.addEventListener(
        "click",
        showNearestFiveToilets
      );
    }

    else {
      console.warn(
        "wc_Btn was not found."
      );
    }

    // Android 直接开始监听方向
    if (deviceTyp === "android") {
      startDeviceDirection();
    }

    /*
    iOS 第一次点击页面时，
    请求方向权限并开始监听。
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


// 页面关闭或离开时停止定位
window.addEventListener(
  "pagehide",
  () => {
    if (map) {
      map.stopLocate();
    }
  }
);


// ==============================
// 加载附近厕所
// ==============================

async function loadNearbyToilets() {
  // 搜索半径，单位是米
  const radius = 1500;

  // 每轮查询开始时读取最新用户位置
  const latitude =
    myLocation.latitude;

  const longitude =
    myLocation.longitude;

  // 还没有用户位置时不发送请求
  if (
    latitude == null ||
    longitude == null
  ) {
    return;
  }

  // 依次查询 node 和 way 类型的厕所
  for (
    const type of [
      "node",
      "way"
    ]
  ) {
    const query = `
      [out:json][timeout:10];

      ${type}["amenity"="toilets"]
      (around:${radius},${latitude},${longitude});

      out center qt;
    `;

    const url =
      "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(query);

    try {
      // 请求 Overpass API
      const response =
        await fetch(url);

      // HTTP 状态不是成功状态
      if (!response.ok) {
        throw new Error(
          "Overpass request failed: " +
          response.status
        );
      }

      // 读取返回的 JSON 数据
      const data =
        await response.json();

      // 遍历所有查询结果
      data.elements.forEach(
        toilet => {
          /*
          使用类型和 OSM ID 组成唯一 ID。

          例如：
          node-123456
          way-123456
          */
          const toiletId =
            toilet.type +
            "-" +
            toilet.id;

          // 已经显示过的厕所直接跳过
          if (
            knownToilets.has(
              toiletId
            )
          ) {
            return;
          }

          /*
          node 直接使用：
          toilet.lat
          toilet.lon

          way 使用中心点：
          toilet.center.lat
          toilet.center.lon
          */
          const toiletLatitude =
            toilet.lat ??
            toilet.center?.lat;

          const toiletLongitude =
            toilet.lon ??
            toilet.center?.lon;

          // 没有完整坐标时跳过
          if (
            toiletLatitude == null ||
            toiletLongitude == null
          ) {
            return;
          }

          // 创建普通蓝色厕所 marker
          const toiletMarker =
            L.marker(
              [
                toiletLatitude,
                toiletLongitude
              ],
              {
                icon: toiletIcon
              }
            ).addTo(map);

          /*
          保存厕所的信息。

          点击按钮时，
          showNearestFiveToilets()
          会使用这些数据计算距离。
          */
          toiletMarkers.push({
            id: toiletId,

            marker:
              toiletMarker,

            latitude:
              toiletLatitude,

            longitude:
              toiletLongitude
          });

          // 记录这个厕所已经显示
          knownToilets.add(
            toiletId
          );
        }
      );
    }

    catch (error) {
      console.warn(
        `Failed to load ${type} toilets:`,
        error
      );
    }

    /*
    node 查询完成后等待 800 毫秒，
    再查询 way，避免请求过于集中。
    */
    if (type === "node") {
      await new Promise(
        resolve => {
          setTimeout(
            resolve,
            800
          );
        }
      );
    }
  }

  /*
  当前一个厕所都没有时：
  10 秒后重新查询。

  已经有厕所时：
  30 秒后重新查询。
  */
  const refreshTime =
    knownToilets.size === 0
      ? 10000
      : 30000;

  // 安排下一轮厕所查询
  setTimeout(
    () => {
      loadNearbyToilets();
    },
    refreshTime
  );
}