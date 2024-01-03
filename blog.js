
let currentTime = new Date();
let twoWeeks = new Date(Date.now() + 12096e5);

let postNumber = 1;

console.log(currentTime.toDateString())
console.log(twoWeeks.toDateString());

const blogPostDiv = document.querySelector('.blog-main');
const blogPost = document.querySelector('.blog-post')
console.log(blogPost);
blogPost.src = `./posts/post${postNumber}.png`;
blogPostDiv.appendChild(blogPost);

// setInterval(() =>{
//     postNumber++;
//  }, 1.21e+9)


// setInterval(() => {
//     if (postNumber >= 5 ) {
//         postNumber = 1;
//         blogPost.src = `./posts/post${postNumber}.png`;
//         blogPostDiv.appendChild(blogPost);
//     } else {
//         postNumber ++ ;
//         blogPost.src = `./posts/post${postNumber}.png`;
//         blogPostDiv.appendChild(blogPost);
//     }

// }, 5000)
