
import google from 'googleapis'

const service = new google.youtube_v3.Youtube()

import http from "http";
import https from "https";
// import puppeteer from "puppeteer";


import puppeteer from 'puppeteer-extra'

// add stealth plugin and use defaults (all evasion techniques)
import StealthPlugin  from 'puppeteer-extra-plugin-stealth'
puppeteer.use(StealthPlugin())

import path from 'path';
import fs, { cp } from 'fs'
import yaml from 'js-yaml'

import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { NONAME } from "dns";

import authorize from './yt_oauth2.js';
import { GaxiosError } from 'gaxios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const settings = {
    recordVideoFolder: path.join(__dirname, "records"),
    
    blank_profile: process.argv.includes("--blank_profile"), // Starts from a blank and temporary profile 
    login: process.argv.includes("--login"),
    fetch: process.argv.includes("--fetch"),
    savecache: process.argv.includes("--savecache"),
    public: process.argv.includes("--public"),
    visible: process.argv.includes("--visible"),
    loadcache: process.argv.includes("--loadcache"),
    reupload: process.argv.includes("--reupload"),
    noquit: process.argv.includes("--noquit"),
    
    window_real_chromium:process.argv.includes("--window_real_chromium"), // Starts the system installed chromium on windows
}
function saveSettings()
{

    const settingsFile = path.join(__dirname,"settings.yaml");
    const doc= yaml.dump(settings.persistent);
    fs.writeFileSync(settingsFile)
    console.log("Saved settings");
}
function loadpersistent()
{
    
    const settingsFile = path.join(__dirname,"settings.yaml");
    try {
        const doc = yaml.load(fs.readFileSync(settingsFile), 'utf8');
        
        settings.persistent = doc
        
        console.log("Loaded settings")
    } catch (e) {
        settings.persistent = {
            account_id_to_monitor:"",
            password:"",
            
        }
        const doc= yaml.dump(settings.persistent);
        if(!fs.existsSync(settingsFile))
        {
            fs.writeFile(settingsFile,doc,()=>{})
        }
        console.log("New settings");
    }
    return settings.persistent
}
loadpersistent();

let launchArgs = {
    headless: !settings.visible, defaultViewport: null,
    ignoreHTTPSErrors: settings.ignore_ssl_errors,
    args: [
        
        '--window-size=1920,1080',
    ],
}

if (!settings.blank_profile) {
        
    let userDataDir = path.join(__dirname, "profile")
    fs.mkdir(userDataDir, { recursive: true }, z => { })
    launchArgs.userDataDir = userDataDir
    
}
if(settings.window_real_chromium)
{
    console.log("Using the system chromium")
    launchArgs.executablePath="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
}

const browser = await puppeteer.launch(launchArgs);

function clickByContent(content,items)
{

        
    function htmlDecode(input) {
        return input.replace("&amp;","&")
    }
    if(!items)
    {
        items= [...document.body.querySelectorAll("*:not(:empty)")].filter(w=> htmlDecode(w.innerHTML) == w.innerText && w.innerText && w.innerText.includes(content) )
    }
    let item = items.pop()
    if(item)
    {
        item.click();
    }
    if(items.length>0)
    {
    
        setTimeout(z=>clickByContent(content),300)
    }
}
async function login()
{
    let page = (await browser.newPage())
    let urlDest = `https://9gag.com/login`
    await page.goto(urlDest);
    
    try{
        await page.waitForSelector('input[name="username"]',{timeout:2000});
        await page.type('input[name="username"]',settings.persistent.account_id_to_monitor)
        await page.type('input[name="password"]',settings.persistent.password)
        await page.evaluate(clickByContent,"I ACCEPT")
        await new Promise(res=>setTimeout(res,1000));
        console.log("Will click on login button ...")
        await page.click("button.login-view__login")
            
        await page.waitForSelector(".post-header",{timeout:5000})
    }
    catch (e){
        await do_screenshot("login_crash",page)
        console.log("Loaded previous session",e)
    }
    page.close()
    console.log("Logged in");
}

async function scrollPage(page)
{
    await page.evaluate(_ => {
        window.scrollBy(0, window.innerHeight);
      });
}

async function complete_posts(posts,page,cursor)
{
    let last = posts[posts.length - 1]
    let after = last.id;
    if(!cursor)
    {
        cursor=`after=${after}&c=10`;
    }
    console.log("Fetching content with cursor",cursor)
    let data = await page.evaluate(
        async function(cursor,account){
            console.log("Fetching",cursor,account)
            let callURL =`https://9gag.com/v1/user-posts/username/${account}/type/likes?${cursor}`
         
            let data = await fetch(callURL, {
                "method": "POST",
            }).then(res=>res.json());
            console.log("Fetched",cursor,account)
            return data
        }
    ,cursor,settings.persistent.account_id_to_monitor)
    return data;
}
async function do_screenshot(filename,page)
{
    await page.screenshot({
        path: filename+'.png', 
    });
}
async function getAllPostsData()
{
    console.log("Starting the collect")
    const posts = [];

    let page = await browser.newPage();
    let urlDest = `https://9gag.com/u/${settings.persistent.account_id_to_monitor}/likes`
    await page.goto(urlDest,{waitUntil:"networkidle2"});
    
    try{
     
    await page.waitForSelector("article",{timeout:5000})
    }
    catch{
        await do_screenshot("getposts_crash",page)
        console.log("No article found")         
        
    }
    
    let originPosts = await page.evaluate(z=>window._config.data.posts)
    
    posts.push(...originPosts);
    let cursor=null;
    for (let i = 0; i < 5; i++) {
        let responseJson = await complete_posts(posts,page,cursor);
        posts.push(...responseJson.data.posts);
        console.log("Added",responseJson.data.posts.length,"post in an total of",posts.length)
        cursor =responseJson.data.nextCursor
    }

    
    for (let pindex = 0; pindex < posts.length; pindex++) {
        let post = posts[pindex];
        let foundEntry=Object.entries(post.images).find(z=>z[1].url.endsWith(".mp4") && z[1].hasAudio ===1 )
        post.postVideo=foundEntry?foundEntry[1]:false
        posts[pindex]=post;
    }

    console.log("Collect ended")
    
    settings.noquit?"":await page.close();
    return posts;

}

function loadPostsFromCache()
{
   let rawdata = fs.readFileSync('postsCache.json');
   let posts= JSON.parse(rawdata);
   console.log("Loaded",posts.length,"posts from cache")
    return posts
}

function savePostsToCache(posts)
{
    let data = JSON.stringify(posts);
    fs.writeFileSync('postsCache.json', data);
    
    console.log("Cached",posts.length,"posts to cache")
}

function filterVideosPosts(posts){
    let rposts= posts.filter(p=>p.postVideo);
    console.log("Filtered",posts.length," posts, lefting",rposts.length,"in posts list")
    return rposts;
}
function stopBeforePreviousUpload(posts){
    let lastID = settings.persistent.lastUploadID
    let previousUpload = posts.findIndex(post=>post.id==lastID);
    console.log(previousUpload,lastID)
    if(previousUpload === -1){
        return posts;
    }
    console.log("Sliced before last uploaded post,",lastID)
    return posts.slice(0,previousUpload)

}
async function insertOneToYoutube(title,stream,description)
{
    
    await new Promise((resolve,reject)=>{
        service.videos.insert({
            auth: settings.client_token,
            part: 'snippet,contentDetails,status',
            resource: {
                // Video title and description
                snippet: {
                    title: title,
                    description: description
                },
                // I set to private for tests
                status: {
                    privacyStatus: settings.public?'public':'private'
                }
            },

            // Create the readable stream to upload the video
            media: {
                body: stream
            }
        },
        (error, data) => {
            if (error) {
                return reject(error);
            }
            resolve(data.data)
        })
    })
}
function urlToName(url)
{
    return  new URL(url).pathname.split("/").slice(-1)[0]
    
}
async function download(url,folder,filename=false,as_stream=true)
{
    const fpath =  path.join(folder||"",filename||urlToName(url));
    
    console.log("Downloading",url,"into",as_stream?"stream":fpath)
    return await new Promise(resolve=>{
        
        (url.startsWith("https")?https:http).get(url, (res) => {
            
            //console.log(res,res.pipe,res.path)
            if(as_stream){
                
                resolve(res); return;}
                fs.mkdirSync(path.dirname(fpath),{recursive:true})
                
                const writeStream = fs.createWriteStream(fpath);
                
                res.pipe(writeStream);
                
                
                writeStream.on("finish", () => {
                    writeStream.close();
                    console.log("Download Completed");
                    resolve(fpath)
                })
            }).on('error', (e) => {
                console.log("Error while downloading", url)
                console.error(e);
                resolve(fpath);
            });
        });
    }
async function uploadOneToYouTube(post)
{
    console.log("Reuploading",post.id)
    let videoStream = await download(post.postVideo.url)
    await insertOneToYoutube(post.title,videoStream,"#Shorts")
    settings.persistent.lastUploadID=post.id
    saveSettings()
}
async function uploadAllToYoutube(posts)
{
    let oauth_secret=fs.readFileSync('client_secret.json', (error, content) => {});
    
    let client_token = await new Promise(resolve=>authorize.authorize(JSON.parse(oauth_secret), resolve));
    settings.client_token=client_token
    console.log("Starting YT reupload")
    posts = posts.reverse();
    for (let index = 0; index < posts.length; index++) {
        let post = posts[index];
        try{        
            await uploadOneToYouTube(post)
        }
        catch(e){
            console.log("Upload ERROR")
            console.error(e.message)
            break;
        }
    }
}
async function doAllStuff()
{
    
    settings.login?await login():"";
    let posts = settings.fetch?await getAllPostsData():false;
    settings.savecache?savePostsToCache(posts):"";
    posts=settings.loadcache&&!posts?loadPostsFromCache():posts;
    if(posts)
    {
       
        posts=stopBeforePreviousUpload(posts)
        posts=filterVideosPosts(posts)
        settings.reupload?uploadAllToYoutube(posts):false;
    }
    
    
        settings.noquit?"":await browser.close();
}

doAllStuff();
