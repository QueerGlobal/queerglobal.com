const carousel = document.querySelector(".img-carousel");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
let carsouselImages = document.querySelectorAll(".img-carousel div");

//Next Carousel
const nextCarousel = () => {
    if (carsouselImages[carsouselImages.length - 1]) {
        carousel.scrollTo(0, 0);
    }
    carousel.scrollBy(300, 0);
};

nextBtn.addEventListener("click", (e) => {
    nextCarousel();
});

//Prev Carousel
const prevCarousel = () => {
    if (carsouselImages[0]) {
        carousel.scrollTo(4800, 0);
    }
    carousel.scrollBy(-300, 0);
};

prevBtn.addEventListener("click", (e) => {
    prevCarousel();
});

// Auto carousel
const auto = true; // Auto scroll
const intervalTime = 2500;
let sliderInterval;

if (auto) {
    sliderInterval = setInterval(nextCarousel, intervalTime);
}

carousel.addEventListener("mouseover", (stopInterval) => {
    clearInterval(sliderInterval);
});

carousel.addEventListener("mouseleave", (startInterval) => {
    if (auto) {
        sliderInterval = setInterval(nextCarousel, intervalTime);
    }
});

//for mobile events
carousel.addEventListener("touchstart", (stopIntervalT) => {
    clearInterval(sliderInterval);
});
carousel.addEventListener("touchend", (startIntervalT) => {
    if (auto) {
        sliderInterval = setInterval(nextCarousel, intervalTime);
    }
});

//Debounce
var previousCall;
window.addEventListener("resize", () => {
    if (previousCall >= 0) {
        clearTimeout(previousCall);
    }
    previousCall = setTimeout(() => {
        carousel.scrollBy(-300, 0);
    }, 200);
});
