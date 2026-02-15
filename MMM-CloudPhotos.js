//
//
// MMM-CloudPhotos
//
Module.register("MMM-CloudPhotos", {
  defaults: {
    showWidth: 1080,
    showHeight: 1920,
    timeFormat: "relative", // Use "relative" for "3 years ago" style, or a moment format like "YYYY/MM/DD HH:mm"
  },
  requiresVersion: "2.24.0",

  suspended: false,

  getStyles: function () {
    return ["MMM-CloudPhotos.css"];
  },

  start: function () {
    this.sendSocketNotification("INIT", this.config);
  },

  socketNotificationReceived: function (noti, payload) {
    if (noti === "DISPLAY_PHOTO") {
      Log.info("[MMM-CloudPhotos] Received photo:", payload.filename);
      this.displayPhoto(payload);
    }
    if (noti === "ERROR") {
      const current = document.getElementById("GPHOTO_CURRENT");
      const errMsgDiv = document.createElement("div");
      errMsgDiv.style.textAlign = "center";
      errMsgDiv.style.lineHeight = "80vh";
      errMsgDiv.style.fontSize = "1.5em";
      errMsgDiv.style.verticalAlign = "middle";
      errMsgDiv.textContent = payload.message || payload;
      current.appendChild(errMsgDiv);
    }
    if (noti === "UPDATE_STATUS") {
      let info = document.getElementById("GPHOTO_INFO");
      info.innerHTML = String(payload);
    }
  },

  displayPhoto: function (photo) {
    const dataUrl = `data:image/jpeg;base64,${photo.image}`;

    const img = new Image();
    img.onload = () => {
      const back = document.getElementById("GPHOTO_BACK");
      const current = document.getElementById("GPHOTO_CURRENT");

      if (!current) return;

      current.textContent = "";
      back.style.backgroundImage = `url(${dataUrl})`;
      current.style.backgroundImage = `url(${dataUrl})`;
      back.classList.add("animated");
      current.classList.add("animated");

      // Update info with metadata
      const info = document.getElementById("GPHOTO_INFO");
      if (info) {
        info.innerHTML = "";

        // Create info elements
        let infoText = document.createElement("div");
        infoText.classList.add("infoText");

        // Check if we have BOTH metadata fields
        const hasBothMetadata = photo.creation_time && photo.location_name;

        // Add photo time
        if (photo.creation_time) {
          let photoTime = document.createElement("div");
          photoTime.classList.add("photoTime");
          const timestamp = new Date(photo.creation_time);
          photoTime.innerHTML = this.config.timeFormat === "relative"
            ? moment(timestamp).fromNow()
            : moment(timestamp).format(this.config.timeFormat);
          infoText.appendChild(photoTime);
        }

        // Add location (pre-resolved from backend)
        if (photo.location_name) {
          let location = document.createElement("div");
          location.classList.add("photoLocation");
          location.innerHTML = photo.location_name;
          infoText.appendChild(location);
        }

        // Fallback to filename if EITHER location OR date is missing
        if (!hasBothMetadata && photo.filename) {
          let filename = document.createElement("div");
          filename.classList.add("photoFilename");
          filename.innerHTML = photo.filename;
          infoText.appendChild(filename);
        }

        info.appendChild(infoText);
      }

      // Notify backend
      this.sendSocketNotification("IMAGE_LOADED", { id: photo.id });
    };
    img.onerror = () => {
      Log.error("[MMM-CloudPhotos] Failed to load image:", photo.filename);
    };
    img.src = dataUrl;
  },

  getDom: function () {
    let wrapper = document.createElement("div");
    wrapper.id = "GPHOTO";
    let back = document.createElement("div");
    back.id = "GPHOTO_BACK";
    let current = document.createElement("div");
    current.id = "GPHOTO_CURRENT";
    if (this.data.position.search("fullscreen") === -1) {
      if (this.config.showWidth) wrapper.style.width = this.config.showWidth + "px";
      if (this.config.showHeight) wrapper.style.height = this.config.showHeight + "px";
    }
    current.addEventListener("animationend", () => {
      current.classList.remove("animated");
    });
    back.addEventListener("animationend", () => {
      back.classList.remove("animated");
    });
    let info = document.createElement("div");
    info.id = "GPHOTO_INFO";
    info.innerHTML = "Loading...";
    wrapper.appendChild(back);
    wrapper.appendChild(current);
    wrapper.appendChild(info);
    Log.info("updated!");
    return wrapper;
  },

  suspend() {
    this.suspended = true;
  },

  resume() {
    this.suspended = false;
  },
});
