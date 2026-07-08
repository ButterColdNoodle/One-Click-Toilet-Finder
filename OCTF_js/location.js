// 1. 向浏览器请求用户当前位置；
// 2. 把经纬度保存到 myLocation；
// 3. 根据定位成功 / 失败给用户反馈；
// 4. 把定位按钮和 locateUser() 函数连接起来。

// 在全局定义一个对象，用来保存用户当前位置。
// latitude：纬度
// longitude：经度
// isReady：是否已经成功获取位置
let myLocation = {
  latitude: null,
  longitude: null,
  isReady: false
};

let map = null;
// 保存用户当前位置的(如果之后重新定位，只移动这个 marker，不重复创建新的 marker)
let userMarker = null;


// 初始化地图
// 这个函数只负责创建地图和加载 OpenStreetMap 图层
function initMap() {
  // 如果地图已经创建过，直接返回已有地图
  // 这样可以避免重复初始化地图导致报错
  if (map) {
    return map;
  }

  // 创建 Leaflet 地图
  // "map" 对应 index.html 里的 <div id="map"></div>
  // L为Leaflet
  map = L.map("map");

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
    // copyright -- Openstreetmap
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
  // 18 是缩放级别，数字越大地图越近
  map.setView(userPosition, 18);

  // 如果用户 marker 已经存在，就移动 marker
  if (userMarker) {
    // SetLat(纬度)Lng(经度)
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
    myLocation.longitude,
  );
}

// 定位失败时执行
function onError(error) {
   console.warn("Location error:", error);
   alert("Unable to get your location. Please allow location access and try again.");

}

// 页面 HTML 加载完成后自动执行
document.addEventListener("DOMContentLoaded", () => {
  // 自动请求用户定位
  locateUser();
});