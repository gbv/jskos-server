/* eslint-disable no-unused-vars */

async function getTotalCount(api) {
  return fetch(`${api}?limit=0`).then(res => res.headers.get("X-Total-Count"))
}

async function updateTotalCount(api, count) {
  return getTotalCount(api).then(count => {
    const text = (count || count === 0) ? `(${count})` : ""
    document.getElementById(api).querySelector("span").innerText = text
  })
}

function showUserInterface(api) {
  // TODO: <https://github.com/gbv/jskos-server/issues/248>
}
