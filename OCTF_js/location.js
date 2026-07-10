// 1. 向浏览器请求用户当前位置；
// 2. 把经纬度保存到 myLocation；
// 3. 根据定位成功或失败给用户反馈；
// 4. 定位成功后初始化地图，并定时搜索附近厕所。

// 保存用户当前位置
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
// 如果以后再次定位，可以移动原来的 marker，而不是重复创建
let userMarker = null;

// 保存当前页面运行期间已经显示过的厕所
// new Set()是用来保存不重复的数据集合
let knownToilets = new Set();


// 初始化地图
// 负责创建 Leaflet 地图并加载 CARTO 无标签底图
function initMap() {
  // 如果地图已经创建过，就直接返回已有地图
  // 避免重复初始化地图导致报错
  if (map) {
    return map;
  }

  // 创建 Leaflet 地图
  // "map" 对应 index.html 里的 <div id="map"></div>
  // zoomControl: false 用于隐藏默认的 + / - 缩放按钮
  map = L.map("map", {
    zoomControl: false
  });

  // 加载 CARTO 的无标签底图
  // 底图主要显示道路和基础地理信息，
  // 不显示大量餐厅、商店和博物馆等标签
  L.tileLayer(
    "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,

      // 地图来源署名
      // 因为底图使用了 OpenStreetMap 数据和 CARTO 服务，所以两者都要保留
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  ).addTo(map);

  return map;
}


// 在地图上显示用户当前位置
// latitude：用户纬度
// longitude：用户经度
function showUserOnMap(latitude, longitude) {
  // Leaflet 使用 [纬度, 经度] 表示一个位置
  const userPosition = [latitude, longitude];

  // 确保地图已经初始化
  initMap();

  // 把地图中心移动到用户当前位置
  // 16 是缩放级别，数字越大，地图显示得越近
  map.setView(userPosition, 16);

  // 如果用户 marker 已经存在，就移动原来的 marker
  if (userMarker) {
    userMarker.setLatLng(userPosition);
  } else {
    // 如果用户 marker 还不存在，就创建一个
    userMarker = L.marker(userPosition).addTo(map);
  }

  // 页面布局稳定后重新计算地图尺寸
  // 避免地图出现灰块或显示不完整
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}


// 请求用户位置
function locateUser() {
  // 检查浏览器是否支持定位功能
  if ("geolocation" in navigator) {
    // 向浏览器请求一次当前位置
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      onError,
      {
        // 尽量使用高精度定位
        enableHighAccuracy: true,

        // 最多等待 10 秒
        timeout: 10000,

        // 可以使用 30 秒以内的缓存位置
        maximumAge: 30000
      }
    );
  } else {
    // 浏览器完全不支持定位时提示用户
    alert("This browser does not support location services.");
  }
}


// 定位成功时执行
function onSuccess(position) {
  // 保存浏览器返回的纬度和经度
  myLocation.latitude = position.coords.latitude;
  myLocation.longitude = position.coords.longitude;

  // 在地图上显示用户当前位置
  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude
  );

  // 第一次请求附近厕所
  // 后面的定时刷新由 loadNearbyToilets() 自己安排
  loadNearbyToilets(
    myLocation.latitude,
    myLocation.longitude
  );
}


// 定位失败时执行
function onError(error) {
  // 在控制台输出详细错误，方便开发时检查
  console.warn("Location error:", error);

  // 给普通用户显示简单提示
  alert(
    "Unable to get your location. Please allow location access and try again."
  );
}


// 页面 HTML 加载完成后自动请求定位
document.addEventListener("DOMContentLoaded", () => {
  locateUser();
});


// 加载附近厕所
//
// 查询顺序：
// 1. 先查询 node 类型厕所；
// 2. 等待 800 毫秒；
// 3. 再查询 way 类型厕所；
//
// 暂时不查询 relation，因为厕所很少使用 relation 表示，
// 而且 relation 查询可能增加 Overpass API 的处理压力。
async function loadNearbyToilets(latitude, longitude) {
  // 搜索半径，单位是米
  const radius = 1500;

  // 依次查询 node 和 way
  // for...of 会等待当前类型处理完成后再处理下一个类型
  for (const type of ["node", "way"]) {
    // 根据当前 type 生成 Overpass 查询语句
    const query = `
      [out:json][timeout:10];
      ${type}["amenity"="toilets"]
        (around:${radius},${latitude},${longitude});
      out center qt;
    `;

    // 把查询语句转换成可发送给 Overpass API 的网址
    const url =
      "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(query);

    try {
      // 向 Overpass API 请求厕所数据
      const response = await fetch(url);

      // 如果服务器返回 404、429、500、504 等错误状态，
      // 就进入下面的 catch
      if (!response.ok) {
        throw new Error(
          "Overpass request failed: " + response.status
        );
      }

      // 把服务器返回的数据解析成 JavaScript 对象
      const data = await response.json();

      // 遍历本次查询得到的所有厕所数据
      data.elements.forEach(toilet => {
        // OSM 的 node 和 way 分别拥有自己的 ID，
        // 所以需要把 type 和 id 组合起来作为唯一编号
        const toiletId =
          toilet.type + "-" + toilet.id;

        // 如果当前厕所已经显示过，就跳过它
        // 避免定时刷新后重复创建相同 marker
        if (knownToilets.has(toiletId)) {
          return;
        }

        // node 类型直接拥有 lat 和 lon
        // way 类型一般使用中心位置 center.lat 和 center.lon
        const toiletLatitude =
          toilet.lat ?? toilet.center?.lat;

        const toiletLongitude =
          toilet.lon ?? toilet.center?.lon;

        // 如果当前厕所没有完整坐标，就跳过当前厕所
        // 这里不会停止整个函数，只会继续处理下一个厕所
        if (
          toiletLatitude == null ||
          toiletLongitude == null
        ) {
          return;
        }

        // 在地图上添加新厕所的 marker
        // 已经存在的厕所 marker 不会被删除
        L.marker([
          toiletLatitude,
          toiletLongitude
        ]).addTo(map);

        // 记录这个厕所已经显示过
        knownToilets.add(toiletId);
      });
    } catch (error) {
      // 请求失败时只在控制台显示错误
      // 即使 node 请求失败，程序仍然会继续尝试 way
      console.warn(
        `Failed to load ${type} toilets:`,
        error
      );
    }

    // node 查询结束后等待 800 毫秒，再查询 way
    // 避免短时间内连续发送两个请求，降低出现 429 或 504 的概率
    if (type === "node") {
      await new Promise(resolve => {
        setTimeout(resolve, 800);
      });
    }
  }

  // 如果一个厕所都没有显示，10 秒后重新查询
  // 如果地图上已经有厕所，30 秒后重新查询
  const refreshTime =
    knownToilets.size === 0
      ? 10000
      : 30000;

  // 使用 setTimeout，而不是 setInterval
  // 这样会等本轮 node 和 way 请求全部结束后，再开始计时，
  // 可以避免多轮请求同时运行
  setTimeout(() => {
    loadNearbyToilets(latitude, longitude);
  }, refreshTime);
}