/*
One-Click Toilet Finder

功能：
1. 创建地图并持续定位。
2. 查询并保存附近厕所。
3. 根据手机方向旋转用户箭头。
4. 筛选直线最近的最多五个厕所。
5. 比较实际步行路线并选择最短者。
6. 显示待走路线和已走路线。
7. 显示剩余距离与转向提示。
8. 偏航后自动重算。
9. 到达厕所附近时提示。

依赖：
- Leaflet
- index.html 中已有的 deviceTyp
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

// 保存厕所坐标和 marker
let toiletMarkers = [];

// 避免重复启动查询循环
let toiletSearchStarted = false;

// 最终选择的厕所
let selectedToilet = null;

// 避免重复比较路线
let routeSelectionRunning = false;


// ========================================
// 2. 用户与厕所图标
// ========================================

const user_icon = L.divIcon({
  className: "user_icon",

  html: `
    <div class="user_arrow"></div>
  `,

  iconSize: [22, 30],
  iconAnchor: [11, 15]
});

// 普通厕所：蓝色
const toiletIcon = new L.Icon.Default();

// 候选厕所：绿色
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

const greenToiletIcon = L.icon({
  iconUrl: greenToiletSvg,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

// 最终厕所：放大约 1.5 倍
const bigGreenToiletIcon = L.icon({
  iconUrl: greenToiletSvg,
  iconSize: [38, 62],
  iconAnchor: [19, 62],
  popupAnchor: [1, -52]
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
// 4. 导航数据
// ========================================

// 当前路线及进度
let navigation = null;

// 待走路线
let routeLine = null;

// 已走路线
let passedLine = null;

// 用户位置到路线投影点的虚线
let connectorLine = null;

// 每次重新选择时增加，避免旧请求覆盖新路线
let navigationVersion = 0;

// 开始偏航的时间
let offRouteSince = null;

// 开始满足到达条件的时间
let arrivalSince = null;

// 上次重算时间
let lastReroute = -Infinity;

// 是否正在重算
let rerouteRunning = false;


// ========================================
// 5. 显示导航文字
// ========================================

function navigationMessage(message) {
  const element =
    document.getElementById("navigation_status");

  if(element) {
    // 使用 textContent，避免把服务返回文字当 HTML
    element.textContent = message;
  }
}


// ========================================
// 6. 初始化地图
// ========================================

function initMap() {
  if(map) {
    return map;
  }

  map = L.map("map", {
    zoomControl: false
  });
// CARTO 底图访问 Key
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
  map.on("locationerror", onLocationError);

  return map;
}


// ========================================
// 7. 显示用户位置
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

  // 保留你原来的地图跟随逻辑
  map.setView(
    position,
    map.getZoom(),
    {
      animate: false
    }
  );
}


// ========================================
// 8. 持续定位
// ========================================

function locateUser() {
  initMap();

  if(!navigator.geolocation) {
    navigationMessage("当前浏览器不支持定位。");
    return;
  }

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
  没有指南针方向时：
  使用 GPS 提供的移动方向。

  静止或移动过慢时不使用，
  因为这时 GPS 行进方向可能不可靠。
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

  // 每次位置更新时计算导航进度
  updateNavigation(event);

  if(!toiletSearchStarted) {
    toiletSearchStarted = true;
    loadNearbyToilets();
  }
}

function onLocationError(error) {
  console.warn("Location error:", error);

  navigationMessage(
    "定位失败，请检查定位权限；等待定位恢复。"
  );

  // 没有定位期间不能继续累计偏航或到达时间
  offRouteSince = null;
  arrivalSince = null;
}


// ========================================
// 9. 获取手机方向
// ========================================

function userDirectionGet(event) {
  if(deviceTyp === "ios") {
    if(event.webkitCompassHeading == null) {
      return;
    }

    userDirection = event.webkitCompassHeading;
  } else if(deviceTyp === "android") {
    // 必须是相对于地球坐标的绝对方向
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
  const screenAngle =
    screen.orientation?.angle || 0;

  userDirection =
    (userDirection + screenAngle + 360) % 360;

  userArrowRotate();
}


// ========================================
// 10. 平滑旋转箭头
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

    // 359° → 0° 应该只转 1°
    if(change < -180) {
      change += 360;
    } else if(change > 180) {
      change -= 360;
    }

    userRotate += change;
  }

  lastDirection = userDirection;

  arrowElement.style.transform =
    `rotate(${userRotate}deg)`;
}


// ========================================
// 11. 开始监听方向
// ========================================

async function startDeviceDirection() {
  if(directionListeningStarted) {
    return;
  }

  if(!window.DeviceOrientationEvent) {
    return;
  }

  if(deviceTyp === "ios") {
    /*
    iOS 方向权限必须在用户点击时请求。
    拒绝后仍然可以使用定位和步行路线。
    */
    if(
      typeof DeviceOrientationEvent.requestPermission
      === "function"
    ) {
      try {
        const permission =
          await DeviceOrientationEvent.requestPermission();

        if(permission !== "granted") {
          return;
        }
      } catch(error) {
        console.warn(
          "Direction permission failed:",
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
  } else if(deviceTyp === "android") {
    window.addEventListener(
      "deviceorientationabsolute",
      userDirectionGet
    );

    directionListeningStarted = true;
  }
}


// ========================================
// 12. 带超时的网络请求
// ========================================

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, 12000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    /*
    在超时范围内读取响应体。
    避免响应头返回后，下载内容一直卡住。
    */
    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,

      json: async () => {
        return JSON.parse(body);
      }
    };
  } finally {
    clearTimeout(timer);
  }
}


// ========================================
// 13. 查询附近厕所
// ========================================

async function loadNearbyToilets() {
  const radius = 1500;

  const latitude = myLocation.latitude;
  const longitude = myLocation.longitude;

  if(latitude == null || longitude == null) {
    return;
  }

  // 保留原来的 node / way 分开查询
  for(const type of ["node", "way"]) {
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
      const response = await fetchWithTimeout(url);

      if(!response.ok) {
        throw new Error(
          "Overpass request failed: " + response.status
        );
      }

      const data = await response.json();

      for(const toilet of data.elements) {
        const toiletId =
          toilet.type + "-" + toilet.id;

        if(knownToilets.has(toiletId)) {
          continue;
        }

        const toiletLatitude =
          toilet.lat ?? toilet.center?.lat;

        const toiletLongitude =
          toilet.lon ?? toilet.center?.lon;

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

        toiletMarkers.push({
          id: toiletId,
          marker,
          latitude: toiletLatitude,
          longitude: toiletLongitude
        });

        knownToilets.add(toiletId);
      }
    } catch(error) {
      console.warn(
        `Failed to load ${type} toilets:`,
        error
      );
    }

    // 两个查询之间稍作间隔
    if(type === "node") {
      await new Promise(resolve => {
        setTimeout(resolve, 800);
      });
    }
  }

  // 保留仓库原来的刷新间隔
  const refreshTime =
    knownToilets.size === 0 ? 10000 : 30000;

  setTimeout(loadNearbyToilets, refreshTime);
}


// ========================================
// 14. 解码 Valhalla 路线
// ========================================

/*
Valhalla 返回的 shape 是 polyline6。

解码后得到：
[
  [纬度, 经度],
  [纬度, 经度],
  ...
]

这个数组可以直接交给 L.polyline()。
*/

function decodePolyline6(shape) {
  if(typeof shape !== "string" || !shape.length) {
    throw new Error("Missing route shape");
  }

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
      if(index >= shape.length || shift > 30) {
        throw new Error("Invalid route shape");
      }

      byte = shape.charCodeAt(index++) - 63;

      if(byte < 0 || byte > 63) {
        throw new Error("Invalid route character");
      }

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

    if(
      Math.abs(latitude) > 90000000 ||
      Math.abs(longitude) > 180000000
    ) {
      throw new Error("Invalid route coordinates");
    }

    points.push([
      latitude / 1e6,
      longitude / 1e6
    ]);
  }

  if(points.length < 2) {
    throw new Error("Route is too short");
  }

  return points;
}


// ========================================
// 15. 请求一个厕所的步行路线
// ========================================

/*
保留原函数名 getWalkingDistance。

现在返回的不只是距离，而是：
{
  walkingDistance: 步行距离，单位米,
  points: 路线坐标数组,
  maneuvers: 转向说明数组
}
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
    units: "kilometers",

    // 同时请求转向文字
    directions_type: "instructions"
  };

  const url =
    "https://valhalla1.openstreetmap.de/route?json=" +
    encodeURIComponent(JSON.stringify(requestData));

  const response = await fetchWithTimeout(url, {
    method: "GET",

    headers: {
      "X-Client-Id":
        "buttercoldnoodle.github.io/One-Click-Toilet-Finder"
    }
  });

  if(!response.ok) {
    throw new Error(
      "Walking route request failed: " + response.status
    );
  }

  const data = await response.json();

  const length = data.trip?.summary?.length;

  if(!Number.isFinite(length) || length < 0) {
    throw new Error("Walking route distance is missing");
  }

  const leg = data.trip.legs?.[0];
  const points = decodePolyline6(leg?.shape);

  return {
    walkingDistance: length * 1000,
    points,
    maneuvers: leg.maneuvers || []
  };
}


// ========================================
// 16. 选择最近厕所并开始导航
// ========================================

async function findBestToilet() {
  if(!map) {
    return;
  }

  if(
    myLocation.latitude == null ||
    myLocation.longitude == null
  ) {
    navigationMessage("等待定位，请允许位置权限。");
    return;
  }

  if(toiletMarkers.length === 0) {
    navigationMessage(
      "附近厕所尚未加载，请稍后点击 WC。"
    );

    return;
  }

  if(routeSelectionRunning) {
    return;
  }

  routeSelectionRunning = true;

  // 清除旧导航，同时让旧重算请求失效
  stopNavigation();

  navigationMessage("正在比较步行路线…");

  const wcBtn = document.getElementById("wc_Btn");

  if(wcBtn) {
    wcBtn.disabled = true;
  }

  try {
    /*
    所有候选使用同一个起点。
    避免比较期间位置更新导致比较不公平。
    */
    const startPosition = {
      latitude: myLocation.latitude,
      longitude: myLocation.longitude
    };

    selectedToilet = null;

    // 恢复所有厕所的默认图标
    for(const toilet of toiletMarkers) {
      toilet.marker.setIcon(toiletIcon);
      toilet.marker.setZIndexOffset(0);
    }

    // 计算直线距离并取最近五个
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

    for(const toilet of nearestFive) {
      toilet.marker.setIcon(greenToiletIcon);
      toilet.marker.setZIndexOffset(1000);
    }

    const walkingResults = [];

    // 依次请求，避免同时向服务发送五次请求
    for(const toilet of nearestFive) {
      try {
        const route = await getWalkingDistance(
          startPosition,
          toilet
        );

        walkingResults.push({
          ...toilet,
          route,
          walkingDistance: route.walkingDistance
        });
      } catch(error) {
        // 一个候选失败，不影响其他候选
        console.warn(
          "Failed to get route for " + toilet.id,
          error
        );
      }
    }

    if(walkingResults.length === 0) {
      navigationMessage(
        "路线请求失败，请点击 WC 重试。"
      );

      return;
    }

    walkingResults.sort((a, b) => {
      return a.walkingDistance - b.walkingDistance;
    });

    selectedToilet = walkingResults[0];

    selectedToilet.marker.setIcon(
      bigGreenToiletIcon
    );

    selectedToilet.marker.setZIndexOffset(2000);

    /*
    直接使用刚才已经请求到的路线。
    不再为最终厕所重复请求一次。
    */
    beginNavigation(selectedToilet.route);
  } catch(error) {
    console.warn("Route selection failed:", error);

    navigationMessage(
      "导航启动失败，请点击 WC 重试。"
    );
  } finally {
    routeSelectionRunning = false;

    if(wcBtn) {
      wcBtn.disabled = false;
    }
  }
}


// ========================================
// 17. 清除当前导航
// ========================================

function stopNavigation() {
  navigationVersion++;

  for(const layer of [
    routeLine,
    passedLine,
    connectorLine
  ]) {
    if(layer) {
      map.removeLayer(layer);
    }
  }

  navigation = null;

  routeLine = null;
  passedLine = null;
  connectorLine = null;

  offRouteSince = null;
  arrivalSince = null;

  rerouteRunning = false;
  lastReroute = -Infinity;
}


// ========================================
// 18. 显示新路线
// ========================================

function beginNavigation(route) {
  // 重算时移除旧线条
  for(const layer of [
    routeLine,
    passedLine,
    connectorLine
  ]) {
    if(layer) {
      map.removeLayer(layer);
    }
  }

  /*
  cumulative[i]：
  从路线起点走到第 i 个路线点的累计距离。

  例如：
  [0, 12, 28, 45, ...]
  */
  const cumulative = [0];

  for(let i = 1; i < route.points.length; i++) {
    const segmentLength = map.distance(
      route.points[i - 1],
      route.points[i]
    );

    cumulative.push(
      cumulative[i - 1] + segmentLength
    );
  }

  navigation = {
    ...route,
    cumulative,

    // 已走距离
    progress: 0,

    arrived: false,

    // 上一次有效定位的时间
    lastFix: null
  };

  // 已走路线：淡蓝
  passedLine = L.polyline([], {
    color: "#1677ff",
    weight: 6,
    opacity: 0.18,
    interactive: false
  }).addTo(map);

  // 待走路线：蓝色
  routeLine = L.polyline(route.points, {
    color: "#1677ff",
    weight: 6,
    lineCap: "round",
    interactive: false
  }).addTo(map);

  // 用户位置到路线投影点：虚线
  connectorLine = L.polyline([], {
    color: "#1677ff",
    weight: 3,
    dashArray: "4 6",
    interactive: false
  }).addTo(map);

  offRouteSince = null;
  arrivalSince = null;

  navigationMessage(
    `步行约 ${Math.round(route.walkingDistance)} 米`
  );
}


// ========================================
// 19. 找用户在线路上的投影点
// ========================================

/*
把每两个相邻路线点看作一条线段。

对于每条线段：
1. 找用户在该线段上的最近点。
2. 算用户离该点多远。
3. 算该点对应的沿线进度。

只允许在当前进度附近匹配，
减少交叉路口跳到后半程的情况。
*/

function projectToRoute(
  position,
  route,
  maxProgress = Infinity
) {
  let best = null;

  // 经度方向随纬度缩短，需要做比例修正
  const scale =
    Math.cos(position[0] * Math.PI / 180);

  for(let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i];
    const b = route.points[i + 1];

    const ax =
      (a[1] - position[1]) * scale;

    const ay =
      a[0] - position[0];

    const dx =
      (b[1] - a[1]) * scale;

    const dy =
      b[0] - a[0];

    const denominator =
      dx * dx + dy * dy;

    // t 为投影点在线段上的比例，范围 0 到 1
    const t = denominator
      ? Math.max(
          0,
          Math.min(
            1,
            -(ax * dx + ay * dy) / denominator
          )
        )
      : 0;

    const point = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t
    ];

    const segmentLength =
      route.cumulative[i + 1] -
      route.cumulative[i];

    const progress =
      route.cumulative[i] + segmentLength * t;

    // 排除过远的旧路段与过远的未来路段
    if(
      progress < route.progress - 20 ||
      progress > maxProgress
    ) {
      continue;
    }

    const distance =
      map.distance(position, point);

    /*
    两条路段距离非常接近时，
    优先保留前面找到的路段。
    */
    if(!best || distance < best.distance - 2) {
      best = {
        i,
        point,
        progress,
        distance
      };
    }
  }

  return best;
}


// ========================================
// 20. 每次定位更新导航
// ========================================

function updateNavigation(event) {
  if(
    !navigation ||
    navigation.arrived ||
    routeSelectionRunning
  ) {
    return;
  }

  const now = performance.now();

  const position = [
    myLocation.latitude,
    myLocation.longitude
  ];

  const accuracy = event.accuracy;

  /*
  精度较差时：
  不推进路线，不判断偏航，也不判断到达。
  */
  if(
    !Number.isFinite(accuracy) ||
    accuracy > 35
  ) {
    offRouteSince = null;
    arrivalSince = null;

    navigationMessage(
      "定位精度较低，等待更准确的位置…"
    );

    return;
  }

  // 距上次有效定位过去多少秒
  const gap = navigation.lastFix == null
    ? 0
    : (now - navigation.lastFix) / 1000;

  /*
  定位中断超过 10 秒：
  重置“持续偏航”和“持续到达”计时。
  */
  if(gap > 10) {
    offRouteSince = null;
    arrivalSince = null;
  }

  navigation.lastFix = now;

  // 限制一次定位允许向前匹配的范围
  const maxAdvance = Math.max(
    50,
    Math.min(gap, 30) * 4
  );

  const matched = projectToRoute(
    position,
    navigation,
    navigation.progress + maxAdvance
  );

  // ----------------------------------------
  // 偏航判断
  // ----------------------------------------

  if(!matched || matched.distance > 25) {
    arrivalSince = null;

    if(offRouteSince == null) {
      offRouteSince = now;
    }

    navigationMessage(
      "已偏离路线，正在确认位置…"
    );

    const offRouteLongEnough =
      now - offRouteSince >= 8000;

    const cooldownFinished =
      now - lastReroute >= 20000;

    if(offRouteLongEnough && cooldownFinished) {
      rerouteNavigation();
    }

    return;
  }

  offRouteSince = null;

  /*
  GPS 轻微后退时不减少进度，
  避免路线反复变深、变浅。
  */
  navigation.progress = Math.max(
    navigation.progress,
    matched.progress
  );

  // ----------------------------------------
  // 找到当前进度所在的线段
  // ----------------------------------------

  let i = 0;

  while(
    i < navigation.points.length - 2 &&
    navigation.cumulative[i + 1] <
      navigation.progress
  ) {
    i++;
  }

  const segmentLength =
    navigation.cumulative[i + 1] -
    navigation.cumulative[i];

  const t = segmentLength
    ? (
        navigation.progress -
        navigation.cumulative[i]
      ) / segmentLength
    : 0;

  const a = navigation.points[i];
  const b = navigation.points[i + 1];

  // 当前进度对应的精确分割点
  const split = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t
  ];

  // 分割点之前：已走路线
  passedLine.setLatLngs([
    ...navigation.points.slice(0, i + 1),
    split
  ]);

  // 分割点之后：待走路线
  routeLine.setLatLngs([
    split,
    ...navigation.points.slice(i + 1)
  ]);

  /*
  用户箭头始终位于真实 GPS 位置。

  虚线把 GPS 位置连接到路线分割点，
  不强行把用户 marker 吸附到道路上。
  */
  connectorLine.setLatLngs([
    position,
    split
  ]);

  // ----------------------------------------
  // 剩余距离
  // ----------------------------------------

  const totalLength =
    navigation.cumulative[
      navigation.cumulative.length - 1
    ];

  const remaining =
    totalLength - navigation.progress;

  const destinationDistance = map.distance(
    position,
    [
      selectedToilet.latitude,
      selectedToilet.longitude
    ]
  );

  // ----------------------------------------
  // 到达判断
  // ----------------------------------------

  if(
    remaining <= 20 &&
    destinationDistance <= 25 &&
    accuracy <= 20
  ) {
    if(arrivalSince == null) {
      arrivalSince = now;
    }

    if(now - arrivalSince >= 5000) {
      navigation.arrived = true;

      connectorLine.setLatLngs([]);

      navigationMessage(
        "已到达厕所附近，请确认入口。" +
        "再次点击 WC 可重新寻找。"
      );

      return;
    }
  } else {
    arrivalSince = null;
  }

  // ----------------------------------------
  // 下一条转向提示
  // ----------------------------------------

  const next = navigation.maneuvers.find(
    maneuver => {
      const maneuverPosition =
        navigation.cumulative[
          maneuver.begin_shape_index
        ];

      return maneuverPosition >
        navigation.progress + 5;
    }
  );

  let instruction = "";

  if(next) {
    const distanceToTurn =
      navigation.cumulative[
        next.begin_shape_index
      ] - navigation.progress;

    instruction =
      ` · ${Math.round(distanceToTurn)} 米后：` +
      next.instruction;
  }

  navigationMessage(
    `剩余约 ${Math.round(remaining)} 米` +
    instruction
  );
}


// ========================================
// 21. 偏航后重新规划
// ========================================

async function rerouteNavigation() {
  if(
    rerouteRunning ||
    routeSelectionRunning ||
    !selectedToilet
  ) {
    return;
  }

  rerouteRunning = true;
  lastReroute = performance.now();

  const version = navigationVersion;
  const destination = selectedToilet;

  navigationMessage("正在重新规划步行路线…");

  try {
    const route = await getWalkingDistance(
      {
        latitude: myLocation.latitude,
        longitude: myLocation.longitude
      },
      destination
    );

    /*
    请求期间如果用户重新选择了厕所，
    当前请求就已经过期，不能覆盖新路线。
    */
    if(version !== navigationVersion) {
      return;
    }

    beginNavigation(route);
  } catch(error) {
    if(version === navigationVersion) {
      navigationMessage(
        "重算失败，保留原路线，稍后重试。"
      );
    }

    console.warn("Reroute failed:", error);
  } finally {
    if(version === navigationVersion) {
      rerouteRunning = false;
    }
  }
}


// ========================================
// 22. 页面启动与恢复
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  locateUser();

  const wcBtn = document.getElementById("wc_Btn");

  if(wcBtn) {
    wcBtn.addEventListener("click", () => {
      // iOS 可通过这次点击请求或重试方向权限
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