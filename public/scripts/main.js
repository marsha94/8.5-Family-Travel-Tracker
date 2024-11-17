document.addEventListener("DOMContentLoaded", function () {
  // Color the visited countries on the map
  fetch("/api/getData")
    .then((response) => response.json())
    .then((data) => {
      const { color, countryCode } = data;
      countryCode.forEach((code) => {
        const element = document.getElementById(code);
        if (element) {
          element.style.fill = color;
        }
      });
    });

  let input = document.getElementById("country-input");
  let awesomplete = new Awesomplete(input, {
    minChars: 1,
    autoFirst: true,
    list: [],
  });

  let debounceTimer;

  input.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    let query = input.value;

    debounceTimer = setTimeout(function () {
      if (query.length >= 1) {
        axios
          .get("/api/countries", {
            params: {
              q: query,
            },
          })
          .then(function (response) {
            let list = response.data;

            // Remove duplicates and sort
            list = Array.from(new Set(list)).sort();

            awesomplete.list = list;
          })
          .catch(function (error) {
            console.error(error);
            awesomplete.list = [];
          });
      } else {
        awesomplete.list = [];
      }
    }, 300); // Delay of 300 milliseconds
  });
});
