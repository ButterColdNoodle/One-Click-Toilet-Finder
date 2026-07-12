// 1. 使用 Leaflet 请求并持续监听用户当前位置；
// 2. 把最新经纬度保存到 myLocation；
// 3. 定位成功时移动用户 marker；
// 4. 定位失败时给用户反馈；
// 5. 第一次定位成功后启动附近厕所查询。

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

// 保存当前页面运行期间已经显示过的厕所
// new Set() 用来保存不重复的数据
let knownToilets = new Set();

// 记录厕所查询是否已经启动
// 防止每次用户位置更新时都创建一套新的定时查询
let toiletSearchStarted = false;


// 初始化地图
// 负责创建 Leaflet 地图、加载底图和绑定定位事件
function initMap() {
  // 如果地图已经创建过，直接返回已有地图
  if (map) {
    return map;
  }

  // 创建 Leaflet 地图
  // zoomControl: false 隐藏默认的 + / - 按钮
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

  // Leaflet 成功获得用户位置时，执行 onLocationFound
  map.on("locationfound", onLocationFound);

  // Leaflet 获取位置失败时，执行 onLocationError
  map.on("locationerror", onLocationError);

  return map;
}


// 在地图上创建或移动用户当前位置 marker
function showUserOnMap(latitude, longitude) {
  const userPosition = [latitude, longitude];

  // 如果 marker 已经存在，只移动原来的 marker
  if (userMarker) {
    userMarker.setLatLng(userPosition);
  } else {
    // 第一次获得位置时创建 marker
    userMarker = L.marker(userPosition).addTo(map);

    // 只在第一次定位时把地图移动到用户位置
    // 后续位置变化不会强制抢回地图中心
    map.setView(userPosition, 16);

    // 避免地图出现灰块或显示不完整
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }
}


// 开始持续监听用户位置
function locateUser() {
  // 先初始化地图
  initMap();

  // 检查浏览器是否支持定位
  if (!navigator.geolocation) {
    alert("This browser does not support location services.");
    return;
  }

  // 使用 Leaflet 的定位功能
  map.locate({
    // 持续监听用户位置，而不是只获取一次
    watch: true,

    // 不让 Leaflet 每次更新位置时自动移动地图
    // 地图第一次居中由 showUserOnMap() 控制
    setView: false,

    // 尽量使用高精度定位
    enableHighAccuracy: true,

    // 每次定位最多等待 10 秒
    timeout: 10000,

    // 时间越短，用户 marker 跟随得越及时
    maximumAge: 0
  });
}


// Leaflet 成功获得位置时执行
// event.latlng 是 Leaflet 整理好的经纬度
function onLocationFound(event) {
  // 保存最新坐标
  myLocation.latitude = event.latlng.lat;
  myLocation.longitude = event.latlng.lng;

  // 创建或移动用户 marker
  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude
  );

  // 厕所查询只启动一次
  // 否则每次位置变化都会再创建一个定时查询循环
  if (!toiletSearchStarted) {
    toiletSearchStarted = true;

    loadNearbyToilets();
  }
}


// Leaflet 定位失败时执行
function onLocationError(error) {
  // 控制台保留详细错误，方便开发时检查
  console.warn("Location error:", error);

  // 给普通用户显示简单提示
  alert(
    "Unable to get your location. Please allow location access and try again."
  );
}


// 页面 HTML 加载完成后开始持续定位
document.addEventListener("DOMContentLoaded", () => {
  locateUser();
});


// 页面被关闭或离开时停止持续定位
window.addEventListener("pagehide", () => {
  if (map) {
    map.stopLocate();
  }
});


// 加载附近厕所
//
// 每轮查询都会读取 myLocation 中的最新位置：
// 1. 先查询 node；
// 2. 等待 800 毫秒；
// 3. 再查询 way；
// 4. 只添加以前没有显示过的新厕所；
// 5. 不删除地图上已有的厕所。
async function loadNearbyToilets() {
  const radius = 1500;

  // 每次开始查询时读取用户最新坐标
  const latitude = myLocation.latitude;
  const longitude = myLocation.longitude;

  // 如果还没有获得用户坐标，就不发送请求
  if (latitude == null || longitude == null) {
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

    const url =
      "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(query);

    try {
      // 向 Overpass API 请求厕所数据
      const response = await fetch(url);

      // 服务器返回错误状态时进入 catch
      if (!response.ok) {
        throw new Error(
          "Overpass request failed: " + response.status
        );
      }

      // 把返回内容转换成 JavaScript 对象
      const data = await response.json();

      // 遍历这次查询到的所有厕所
      data.elements.forEach(toilet => {
        // 使用 type 和 id 组成唯一编号
        // 例如 node-12345 或 way-12345
        const toiletId =
          toilet.type + "-" + toilet.id;

        // 已经显示过的厕所不重复添加
        if (knownToilets.has(toiletId)) {
          return;
        }

        // node 直接有 lat/lon
        // way 使用中心位置 center.lat/center.lon
        const toiletLatitude =
          toilet.lat ?? toilet.center?.lat;

        const toiletLongitude =
          toilet.lon ?? toilet.center?.lon;

        // 没有完整坐标时跳过当前厕所
        if (
          toiletLatitude == null ||
          toiletLongitude == null
        ) {
          return;
        }

        // 添加新厕所 marker
        // 不删除原来已有的厕所
        L.marker([
          toiletLatitude,
          toiletLongitude
        ]).addTo(map);

        // 记录这个厕所已经显示过
        knownToilets.add(toiletId);
      });
    } catch (error) {
      // node 请求失败后仍会继续尝试 way
      console.warn(
        `Failed to load ${type} toilets:`,
        error
      );
    }

    // node 查询结束后等待 800 毫秒，再查询 way
    if (type === "node") {
      await new Promise(resolve => {
        setTimeout(resolve, 800);
      });
    }
  }

  // 一个厕所都没有时，10 秒后重新请求
  // 已经显示厕所时，30 秒后重新请求
  const refreshTime =
    knownToilets.size === 0
      ? 10000
      : 30000;

  // 等本轮请求完成后再安排下一轮
  setTimeout(() => {
    loadNearbyToilets();
  }, refreshTime);
}