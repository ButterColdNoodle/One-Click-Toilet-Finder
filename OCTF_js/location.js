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
  accuracy: null,
  isReady: false
};

let map = null;
let userMarker = null;
let accuracyCircle = null;

function initMap() {
  if (map) {
    return map;
  }

  map = L.map("map");

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  return map;
}

function showUserOnMap(latitude, longitude, accuracy) {
  const userPosition = [latitude, longitude];

  initMap();

  map.setView(userPosition, 16);

  if (userMarker) {
    userMarker.setLatLng(userPosition);
  } else {
    userMarker = L.marker(userPosition).addTo(map);
  }


  if (Number.isFinite(accuracy)) {
    if (accuracyCircle) {
      accuracyCircle.setLatLng(userPosition);
      accuracyCircle.setRadius(accuracy);
    } else {
      accuracyCircle = L.circle(userPosition, {
        radius: accuracy
      }).addTo(map);
    }
  }

  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

function locateUser() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    });
  } else {
    alert("This browser does not support location services.");
  }
}

function onSuccess(position) {
  myLocation.latitude = position.coords.latitude;
  myLocation.longitude = position.coords.longitude;
  myLocation.accuracy = position.coords.accuracy;
  myLocation.isReady = true;

  console.log("Location get!", myLocation);


  showUserOnMap(
    myLocation.latitude,
    myLocation.longitude,
    myLocation.accuracy
  );
}

function onError(error) {
   console.warn("Location error:", error);

}

document.addEventListener("DOMContentLoaded", () => {
  console.log("App started. Requesting location automatically.");
  locateUser();
});