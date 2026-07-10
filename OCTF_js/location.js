// 1. 向浏览器请求用户当前位置；
// 2. 把经纬度保存到 myLocation；
// 3. 根据定位成功 / 失败给用户反馈；
// 4. 定位成功后初始化地图，并搜索附近厕所。

// 在全局定义一个对象，用来保存用户当前位置。
// latitude：纬度
// longitude：经度
// isReady：是否已经成功获取位置
let myLocation = {
  latitude: null,
  longitude: null,
  isReady: false
};

// 保存 Leaflet 地图对象
// 第一次创建地图后会存到这里，之后不重复创建
let map = null;

// 保存用户当前位置的 marker
// 如果之后重新定位，只移动这个 marker，不重复创建新的 marker
let userMarker = null;


// 初始化地图
// 这个函数只负责创建地图和加载 CARTO 无标签底图
function initMap() {
  // 如果地图已经创建过，直接返回已有地图
  // 这样可以避免重复初始化地图导致报错
  if (map) {
    return map;
  }

  // 创建 Leaflet 地图，但去掉自带的那个缩放用 + / - 按钮，也就是 zoomControl
  // "map" 对应 index.html 里的 <div id="map"></div>
  // L 为 Leaflet
  map = L.map("map", {
    zoomControl: false
  });

  // 加载 CARTO 的无标签底图
  // 这样地图上不会显示太多餐厅、商店、博物馆等无关信息
  L.tileLayer("https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,

    // 地图来源：OpenStreetMap 和 CARTO
    // attribution 不能删除，因为这是地图服务要求显示的署名信息
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);

  return map;
}


// 在地图上显示用户当前位置
// latitude：用户纬度
// longitude：用户经度
function showUserOnMap(latitude, longitude) {
  const userPosition = [latitude, longitude];

  // 确保地图已经初始化
  initMap();

  // 把地图中心移动到用户当前位置
  // 16 是缩放级别，数字越大地图越近
  map.setView(userPosition, 16);

  // 如果用户 marker 已经存在，就移动 marker
  if (userMarker) {
    // setLatLng：设置 marker 的纬度和经度
    userMarker.setLatLng(userPosition);
  } else {
    // 如果 marker 不存在，就创建一个新的 marker
    userMarker = L.marker(userPosition).addTo(map);
  }

  // 等页面布局稳定后，重新计算地图大小
  // 这样可以避免地图加载时出现灰块或显示不完整
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}


// 开始获取用户位置
function locateUser() {
  // 判断浏览器是否支持定位功能
  if ("geolocation" in navigator) {
    // 支持定位，就向浏览器请求当前位置
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      // 尽量使用高精度定位
      enableHighAccuracy: true,

      // 最多等待 10 秒
      timeout: 10000,

      // 允许使用 30 秒内的缓存位置
      maximumAge: 30000
    });
  } else {
    // 如果浏览器完全不支持定位功能，就提示用户
    alert("This browser does not support location services.");
  }
}


// 定位成功时执行
function onSuccess(position) {
  // 从浏览器返回的数据中取出坐标
  myLocation.latitude = position.coords.latitude;
  myLocation.longitude = position.coords.longitude;

  // 标记为已经成功获取位置
  myLocation.isReady = true;

  // 在地图上显示当前位置
  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude
  );

  // 根据当前位置加载附近厕所
  loadNearbyToilets(
    myLocation.latitude,
    myLocation.longitude
  );
}


// 定位失败时执行
function onError(error) {
  // 在控制台输出错误，方便开发者调试
  console.warn("Location error:", error);

  // 给用户一个简单提示
  alert("Unable to get your location. Please allow location access and try again.");
}


// 页面 HTML 加载完成后自动执行
document.addEventListener("DOMContentLoaded", () => {
  // 自动请求用户定位
  locateUser();
});


// 加载附近厕所
// 这里采用折中方案：
// 1. 先查 node，速度快，先显示一批厕所；
// 2. 再查 way，补充一些被画成建筑/区域的厕所；
// 3. 暂时不查 relation，因为 relation 更复杂，更容易导致 Overpass 请求超时。
function loadNearbyToilets(latitude, longitude) {
  // 搜索半径，单位是米
  const radius = 1500;

  // 查询 node 类型厕所
  // node 是一个点，通常速度最快，也最容易直接显示在地图上
  const nodeToilet = `
    [out:json][timeout:10];
    node["amenity"="toilets"](around:${radius},${latitude},${longitude});
    out center qt;
  `;

  // 查询 way 类型厕所
  // way 可能是一栋厕所建筑或一个区域，需要用 center 坐标显示 marker
  const wayToilet = `
    [out:json][timeout:10];
    way["amenity"="toilets"](around:${radius},${latitude},${longitude});
    out center qt;
  `;

  // 第一步：先请求 node 厕所
  // 这样可以尽快让用户看到一批厕所 marker
  fetchOverpass(nodeToilet)
    .then(data => {
      console.log("Node toilets found:", data.elements.length);

      // 直接把 node 查询结果显示到地图上
      showToiletsOnMap(data.elements);
    })
    .catch(error => {
      console.warn("Failed to load node toilets:", error);
    });

  // 第二步：稍微延迟后再请求 way 厕所
  // 这样不会把两个请求同时压给 Overpass，减少超时概率
  setTimeout(() => {
    fetchOverpass(wayToilet)
      .then(data => {
        console.log("Way toilets found:", data.elements.length);

        // 直接把 way 查询结果也显示到地图上
        showToiletsOnMap(data.elements);
      })
      .catch(error => {
        console.warn("Failed to load way toilets:", error);
      });
  }, 800);
}


// 把厕所数据显示到地图上
// 1. 过一遍所有厕所的数据，提取所有厕所的经纬度，
// 2. 如果经/维度没有就跳过这个厕所数据，
// 3. 否则标记这些厕所在地图上
function showToiletsOnMap(toilets) {
  toilets.forEach(toilet => {
    const latitude = toilet.lat ?? toilet.center?.lat;
    const longitude = toilet.lon ?? toilet.center?.lon;

    if (latitude == null || longitude == null) {
      return;
    }

    L.marker([latitude, longitude]).addTo(map);
  });
}

// 请求 Overpass API
// query：Overpass 查询语句
function fetchOverpass(query) {
  const url =
    "https://overpass-api.de/api/interpreter?data=" +
    encodeURIComponent(query);

  return fetch(url).then(response => {
    // 如果服务器返回 404、429、504 等错误，就手动抛出错误
    if (!response.ok) {
      throw new Error("Overpass request failed: " + response.status);
    }

    // 如果请求成功，就把返回内容解析成 JSON
    return response.json();
  });
}