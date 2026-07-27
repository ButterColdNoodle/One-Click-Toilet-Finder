/*
One-Click Toilet Finder

当前功能：

1. 创建 Leaflet 地图；
2. 持续监听用户位置；
3. 显示并移动用户箭头；
4. 地图中心跟随用户位置；
5. 查询附近 node 和 way 类型的厕所；
6. 保存厕所 marker 和坐标；
7. 获取手机朝向并旋转用户箭头；
8. 点击 wc_Btn 后：
   - 计算所有厕所的直线距离；
   - 取直线距离最近的最多 5 个厕所；
   - 把这 5 个厕所变成绿色；
   - 依次请求用户到这 5 个厕所的步行路线；
   - 比较实际步行距离；
   - 把步行距离最短的厕所放大 1.5 倍。
*/


// ========================================
// 用户位置
// ========================================

// 保存用户最新位置
let myLocation = {
  latitude: null,
  longitude: null
};


// ========================================
// 地图
// ========================================

// 保存 Leaflet 地图对象
let map = null;


// ========================================
// 用户 marker
// ========================================

// 保存用户当前位置 marker
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


// ========================================
// 厕所数据
// ========================================

// 保存已经显示过的厕所 ID
// 防止相同厕所被重复添加
let knownToilets = new Set();


// 保存所有厕所的数据
//
// 每个厕所包含：
// id
// marker
// latitude
// longitude
let toiletMarkers = [];


// 防止重复启动厕所查询循环
let toiletSearchStarted = false;


// 保存最终选中的厕所
//
// 以后开始正式导航时，
// 可以直接使用这个变量作为导航终点
let selectedToilet = null;


// 标记当前是否正在比较步行路线
//
// 防止用户连续点击按钮，
// 同时启动多组路线请求
let routeSelectionRunning = false;


// ========================================
// 厕所 marker 图标
// ========================================

// 普通厕所使用 Leaflet 默认蓝色 marker
const toiletIcon =
  new L.Icon.Default();


// 绿色 marker 使用的 SVG 图片
//
// 只生成一次，普通绿色图标和放大绿色图标
// 共用同一张 SVG。
const greenToiletSvg =
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
  `);


// 普通大小的绿色厕所 marker
const greenToiletIcon =
  L.icon({
    iconUrl: greenToiletSvg,

    // 与 Leaflet 默认 marker 大小接近
    iconSize: [25, 41],

    // 让 marker 底部尖端对应厕所坐标
    iconAnchor: [12, 41],

    popupAnchor: [1, -34]
  });


// 放大 1.5 倍的绿色厕所 marker
//
// 默认大小约为：
// 25 × 41
//
// 放大 1.5 倍约为：
// 38 × 62
const bigGreenToiletIcon =
  L.icon({
    iconUrl: greenToiletSvg,

    iconSize: [38, 62],

    // 底部尖端仍然对应厕所坐标
    iconAnchor: [19, 62],

    popupAnchor: [1, -52]
  });


// ========================================
// 手机方向
// ========================================

// 保存手机当前朝向
//
// 0°   = 北
// 90°  = 东
// 180° = 南
// 270° = 西
let userDirection = null;


// 保存上一次获得的方向
//
// 用于处理：
// 359° → 0°
// 0° → 359°
//
// 防止箭头突然反方向绕一大圈
let lastDirection = null;


// 保存箭头实际累计旋转角度
//
// 这个值可以大于 360°，
// 也可以小于 0°。
let userRotate = 0;


// 防止重复添加方向事件监听
let directionListeningStarted = false;


// ========================================
// 初始化地图
// ========================================

function initMap() {
  // 地图已经存在时直接返回
  if (map) {
    return map;
  }

  // 创建 Leaflet 地图
  map = L.map(
    "map",
    {
      // 隐藏默认缩放按钮
      zoomControl: false
    }
  );

  // 加载 CARTO 无标签底图
  L.tileLayer(
    "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,

      attribution:
        "&copy; OpenStreetMap contributors, &copy; CARTO"
    }
  ).addTo(map);

  // 定位成功时执行
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


// ========================================
// 显示用户位置
// ========================================

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
    如果方向传感器已经获得方向，
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

  /*
  让地图中心跟随用户位置。

  保持当前缩放等级，
  不播放平移动画。
  */
  map.setView(
    userPosition,
    map.getZoom(),
    {
      animate: false
    }
  );
}


// ========================================
// 开始定位
// ========================================

function locateUser() {
  // 先创建地图
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
    // 持续获得位置
    watch: true,

    /*
    不使用 Leaflet 自带的自动居中。

    地图中心由 showUserOnMap()
    自己控制。
    */
    setView: false,

    // 尽量使用高精度定位
    enableHighAccuracy: true,

    // 每次最多等待 10 秒
    timeout: 10000,

    // 不使用以前缓存的位置
    maximumAge: 0
  });
}


// 定位成功
function onLocationFound(event) {
  // 保存用户最新纬度
  myLocation.latitude =
    event.latlng.lat;

  // 保存用户最新经度
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


// ========================================
// 获得手机方向
// ========================================

function userDirectionGet(event) {
  // iOS
  if (deviceTyp === "ios") {
    // 没有获得指南针角度时停止
    if (
      event.webkitCompassHeading == null
    ) {
      return;
    }

    userDirection =
      event.webkitCompassHeading;
  }

  // Android
  else if (deviceTyp === "android") {
    // 没有获得 alpha 时停止
    if (event.alpha == null) {
      return;
    }

    /*
    Android alpha 与指南针方向相反，
    因此使用 360 - alpha。
    */
    userDirection =
      (360 - event.alpha) % 360;
  }

  // 桌面或其他设备
  else {
    return;
  }

  // 获得新方向后旋转箭头
  userArrowRotate();
}


// ========================================
// 旋转用户箭头
// ========================================

function userArrowRotate() {
  // 用户 marker 还没有创建
  if (!userMarker) {
    return;
  }

  // 还没有获得方向
  if (userDirection == null) {
    return;
  }

  // 获得 marker 最外层 HTML 元素
  const userMarkerElement =
    userMarker.getElement();

  if (!userMarkerElement) {
    return;
  }

  // 找到内部真正的箭头元素
  const userArrowElement =
    userMarkerElement.querySelector(
      ".user_arrow"
    );

  if (!userArrowElement) {
    return;
  }

  // 第一次获得方向
  if (lastDirection == null) {
    userRotate =
      userDirection;

    lastDirection =
      userDirection;
  }

  else {
    // 计算本次与上次的角度变化
    let directionChange =
      userDirection -
      lastDirection;

    /*
    处理顺时针经过北方：

    359° → 0°

    原始变化是 -359°，
    实际应该是 +1°。
    */
    if (directionChange < -180) {
      directionChange += 360;
    }

    /*
    处理逆时针经过北方：

    0° → 359°

    原始变化是 +359°，
    实际应该是 -1°。
    */
    else if (
      directionChange > 180
    ) {
      directionChange -= 360;
    }

    // 加入累计旋转角度
    userRotate +=
      directionChange;

    // 保存本次方向
    lastDirection =
      userDirection;
  }

  // 旋转箭头
  userArrowElement.style.transform =
    `rotate(${userRotate}deg)`;
}


// ========================================
// 请求一个厕所的步行距离
// ========================================

/*
参数：

startPosition
按钮按下时的用户位置。

toilet
需要请求路线的厕所对象。

返回：

用户到这个厕所的实际步行距离，
单位是米。
*/
async function getWalkingDistance(
  startPosition,
  toilet
) {
  /*
  Valhalla 路线请求数据。

  locations：
  第一项是起点；
  第二项是终点。

  costing: pedestrian
  表示计算步行路线。

  units: kilometers
  表示返回的路线长度单位是千米。

  directions_type: none
  表示目前不需要转弯文字说明。
  */
  const requestData = {
    locations: [
      {
        lat:
          startPosition.latitude,

        lon:
          startPosition.longitude
      },

      {
        lat:
          toilet.latitude,

        lon:
          toilet.longitude
      }
    ],

    costing: "pedestrian",

    units: "kilometers",

    directions_type: "none"
  };

  /*
  把 JavaScript 对象转换成 JSON 字符串，
  再放入请求地址。
  */
  const url =
    "https://valhalla1.openstreetmap.de/route?json=" +
    encodeURIComponent(
      JSON.stringify(
        requestData
      )
    );

  // 请求步行路线
  const response =
    await fetch(
      url,
      {
        method: "GET",

        /*
        公开演示服务器建议公开应用
        提供可以识别应用的客户端 ID。
        */
        headers: {
          "X-Client-Id":
            "buttercoldnoodle.github.io/One-Click-Toilet-Finder"
        }
      }
    );

  // 请求返回 HTTP 错误
  if (!response.ok) {
    throw new Error(
      "Walking route request failed: " +
      response.status
    );
  }

  // 把返回内容转换为 JavaScript 对象
  const data =
    await response.json();

  /*
  检查返回结果中是否有路线长度。

  正常情况下路线长度位于：

  data.trip.summary.length
  */
  if (
    !data.trip ||
    !data.trip.summary ||
    typeof data.trip.summary.length
      !== "number"
  ) {
    throw new Error(
      "Walking route distance is missing."
    );
  }

  /*
  Valhalla 当前返回单位是千米。

  例如：

  0.42 千米

  乘以 1000 后变成：

  420 米
  */
  const walkingDistance =
    data.trip.summary.length *
    1000;

  return walkingDistance;
}


// ========================================
// 找最近五个并比较步行距离
// ========================================

async function findBestToilet() {
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

  // 还没有加载任何厕所
  if (toiletMarkers.length === 0) {
    console.warn(
      "No toilet markers are available yet."
    );

    return;
  }

  // 已经正在比较路线
  if (routeSelectionRunning) {
    console.warn(
      "Walking routes are already being checked."
    );

    return;
  }

  // 标记为正在运行
  routeSelectionRunning = true;

  // 获得按钮
  const wcBtn =
    document.getElementById(
      "wc_Btn"
    );

  // 请求期间暂时禁用按钮
  if (wcBtn) {
    wcBtn.disabled = true;
  }

  try {
    /*
    固定本次比较使用的起点。

    即使五次路线请求期间 GPS 更新，
    五个厕所仍然从同一个起点比较，
    保证结果公平。
    */
    const startPosition = {
      latitude:
        myLocation.latitude,

      longitude:
        myLocation.longitude
    };

    // 清除上一次选择结果
    selectedToilet = null;

    /*
    每次重新点击按钮时，
    先把所有厕所恢复成普通蓝色。
    */
    toiletMarkers.forEach(
      toilet => {
        toilet.marker.setIcon(
          toiletIcon
        );

        toilet.marker
          .setZIndexOffset(0);
      }
    );

    /*
    给所有厕所计算直线距离。
    */
    const toiletsWithStraightDistance =
      toiletMarkers.map(
        toilet => {
          const straightDistance =
            map.distance(
              [
                startPosition.latitude,
                startPosition.longitude
              ],
              [
                toilet.latitude,
                toilet.longitude
              ]
            );

          return {
            // 保留厕所原来的信息
            id: toilet.id,

            marker:
              toilet.marker,

            latitude:
              toilet.latitude,

            longitude:
              toilet.longitude,

            // 增加直线距离
            straightDistance:
              straightDistance
          };
        }
      );

    /*
    按直线距离从小到大排序。
    */
    toiletsWithStraightDistance.sort(
      (
        toiletA,
        toiletB
      ) => {
        return (
          toiletA.straightDistance -
          toiletB.straightDistance
        );
      }
    );

    /*
    取直线距离最近的最多五个厕所。

    如果当前只有三个厕所，
    就会使用这三个。
    */
    const nearestFive =
      toiletsWithStraightDistance
        .slice(
          0,
          5
        );

    /*
    先把这五个厕所变成绿色，
    表示它们进入了步行路线候选。
    */
    nearestFive.forEach(
      toilet => {
        toilet.marker.setIcon(
          greenToiletIcon
        );

        toilet.marker
          .setZIndexOffset(1000);
      }
    );

    /*
    保存成功取得步行路线的厕所。

    某一个路线请求失败时，
    不会让全部流程停止。
    */
    const walkingResults = [];

    /*
    使用 for...of 和 await：

    第一个厕所请求完成
    →再请求第二个
    →再请求第三个
    →直到全部请求完成。

    因此不会同时发出五个请求。
    */
    for (
      const toilet of nearestFive
    ) {
      try {
        console.log(
          "Checking walking route:",
          toilet.id
        );

        // 请求这个厕所的步行距离
        const walkingDistance =
          await getWalkingDistance(
            startPosition,
            toilet
          );

        /*
        将步行距离加入厕所对象，
        再保存到成功结果数组。
        */
        walkingResults.push({
          id: toilet.id,

          marker:
            toilet.marker,

          latitude:
            toilet.latitude,

          longitude:
            toilet.longitude,

          straightDistance:
            toilet.straightDistance,

          walkingDistance:
            walkingDistance
        });

        console.log(
          "Walking distance:",
          toilet.id,
          Math.round(
            walkingDistance
          ),
          "meters"
        );
      }

      catch (error) {
        /*
        当前厕所请求失败时，
        只跳过这个厕所，
        继续请求剩余厕所。
        */
        console.warn(
          "Failed to get walking route for " +
          toilet.id +
          ":",
          error
        );
      }
    }

    // 五个路线请求全部失败
    if (
      walkingResults.length === 0
    ) {
      console.warn(
        "No walking routes could be calculated."
      );

      return;
    }

    /*
    按实际步行距离从小到大排序。
    */
    walkingResults.sort(
      (
        toiletA,
        toiletB
      ) => {
        return (
          toiletA.walkingDistance -
          toiletB.walkingDistance
        );
      }
    );

    /*
    排序后的第一项，
    就是实际步行距离最短的厕所。
    */
    selectedToilet =
      walkingResults[0];

    /*
    把最终选中的厕所放大 1.5 倍。

    其他候选厕所继续保持普通绿色，
    最终厕所显示为放大的绿色 marker。
    */
    selectedToilet.marker.setIcon(
      bigGreenToiletIcon
    );

    // 让它显示在其他 marker 上方
    selectedToilet.marker
      .setZIndexOffset(2000);

    // 输出最终结果
    console.log(
      "Selected toilet:",
      selectedToilet.id
    );

    console.log(
      "Selected walking distance:",
      Math.round(
        selectedToilet.walkingDistance
      ),
      "meters"
    );

    /*
    在控制台显示所有成功路线。

    方便检查：
    直线距离和步行距离是否合理。
    */
    console.table(
      walkingResults.map(
        toilet => {
          return {
            id:
              toilet.id,

            straightDistance:
              Math.round(
                toilet.straightDistance
              ),

            walkingDistance:
              Math.round(
                toilet.walkingDistance
              ),

            selected:
              toilet.id ===
              selectedToilet.id
          };
        }
      )
    );
  }

  finally {
    // 无论成功还是失败，都恢复运行状态
    routeSelectionRunning = false;

    // 恢复按钮
    if (wcBtn) {
      wcBtn.disabled = false;
    }
  }
}


// ========================================
// 开始监听手机方向
// ========================================

async function startDeviceDirection() {
  // 已经开始监听
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
    部分 iOS Safari 必须由用户点击，
    才能请求方向权限。
    */
    if (
      typeof DeviceOrientationEvent
        .requestPermission ===
      "function"
    ) {
      try {
        const permission =
          await DeviceOrientationEvent
            .requestPermission();

        if (
          permission !== "granted"
        ) {
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
  else if (
    deviceTyp === "android"
  ) {
    window.addEventListener(
      "deviceorientationabsolute",
      userDirectionGet
    );

    directionListeningStarted = true;
  }
}


// ========================================
// 页面启动
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  () => {
    // 开始持续定位用户
    locateUser();

    // 获得寻找厕所按钮
    const wcBtn =
      document.getElementById(
        "wc_Btn"
      );

    // 给按钮添加点击事件
    if (wcBtn) {
      wcBtn.addEventListener(
        "click",
        findBestToilet
      );
    }

    else {
      console.warn(
        "wc_Btn was not found."
      );
    }

    // Android 直接开始监听方向
    if (
      deviceTyp === "android"
    ) {
      startDeviceDirection();
    }

    /*
    iOS 第一次点击页面时，
    请求方向权限。
    */
    else if (
      deviceTyp === "ios"
    ) {
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


// 页面离开时停止定位
window.addEventListener(
  "pagehide",
  () => {
    if (map) {
      map.stopLocate();
    }
  }
);


// ========================================
// 加载附近厕所
// ========================================

async function loadNearbyToilets() {
  // 查询半径，单位是米
  const radius = 1500;

  // 每轮查询读取用户最新位置
  const latitude =
    myLocation.latitude;

  const longitude =
    myLocation.longitude;

  // 还没有用户位置时停止
  if (
    latitude == null ||
    longitude == null
  ) {
    return;
  }

  // 依次查询 node 和 way
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
      // 请求厕所数据
      const response =
        await fetch(url);

      // HTTP 请求失败
      if (!response.ok) {
        throw new Error(
          "Overpass request failed: " +
          response.status
        );
      }

      // 读取 JSON
      const data =
        await response.json();

      // 遍历所有厕所
      data.elements.forEach(
        toilet => {
          /*
          使用类型和 OSM ID
          组成厕所唯一 ID。

          例如：

          node-123456
          way-123456
          */
          const toiletId =
            toilet.type +
            "-" +
            toilet.id;

          // 已经显示过则跳过
          if (
            knownToilets.has(
              toiletId
            )
          ) {
            return;
          }

          /*
          node 直接有 lat 和 lon。

          way 使用 center.lat
          和 center.lon。
          */
          const toiletLatitude =
            toilet.lat ??
            toilet.center?.lat;

          const toiletLongitude =
            toilet.lon ??
            toilet.center?.lon;

          // 坐标不完整时跳过
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
                icon:
                  toiletIcon
              }
            ).addTo(map);

          /*
          保存厕所 marker 和坐标。

          点击按钮后，
          findBestToilet()
          会使用这些数据。
          */
          toiletMarkers.push({
            id:
              toiletId,

            marker:
              toiletMarker,

            latitude:
              toiletLatitude,

            longitude:
              toiletLongitude
          });

          // 标记为已经显示
          knownToilets.add(
            toiletId
          );
        }
      );
    }

    catch (error) {
      /*
      当前类型请求失败，
      仍然继续尝试另一种类型。
      */
      console.warn(
        `Failed to load ${type} toilets:`,
        error
      );
    }

    /*
    node 查询后等待 800 毫秒，
    再查询 way。
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
  当前没有厕所：
  10 秒后重新查询。

  已经有厕所：
  30 秒后重新查询。
  */
  const refreshTime =
    knownToilets.size === 0
      ? 10000
      : 30000;

  // 安排下一轮查询
  setTimeout(
    () => {
      loadNearbyToilets();
    },
    refreshTime
  );
}