// update.js
const fs = require('fs/promises');
const axios = require('axios');

// --- PHẦN BÁC CẦN THAY ĐỔI ---
const CHANNEL_ID = 'UC7EYRP--kBfvu1y84p2sFcA'; // DÁN CHANNEL ID CỦA BÁC VÀO ĐÂY, THAY THẾ CHO 'UCxxxxxxxxxxxxxxxxx'
// -----------------------------

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Lấy API Key từ GitHub Secrets, không cần sửa
const MAX_RESULTS_PER_PAGE = 50;
const CATALOG_FILE = 'catalog.json';
const PLAYLISTS_FILE = 'playlists.json';

if (!YOUTUBE_API_KEY) {
  throw new Error("Lỗi: Không tìm thấy YOUTUBE_API_KEY. Bác đã cấu hình GitHub Secrets chưa?");
}

async function fetchAllChannelVideos() {
  console.log('Bắt đầu lấy danh sách video...');
  let allVideos = [];
  let nextPageToken = null;
  
  const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos`;

  do {
    try {
      const searchParams = {
        part: 'snippet', channelId: CHANNEL_ID, maxResults: MAX_RESULTS_PER_PAGE,
        order: 'date', type: 'video', key: YOUTUBE_API_KEY, pageToken: nextPageToken,
      };
      const searchResponse = await axios.get(searchUrl, { params: searchParams });
      const videoItems = searchResponse.data.items;
      if (!videoItems || videoItems.length === 0) break;

      const videoIds = videoItems.map(item => item.id.videoId).join(',');
      const videosResponse = await axios.get(videosUrl, {
        params: { part: 'snippet,statistics', id: videoIds, key: YOUTUBE_API_KEY }
      });

      allVideos.push(...videosResponse.data.items);
      console.log(`Đã lấy được ${videosResponse.data.items.length} video. Tổng cộng: ${allVideos.length}`);
      nextPageToken = searchResponse.data.nextPageToken;
    } catch (error) {
      console.error("Lỗi khi gọi API video:", error.response ? error.response.data.error.message : error.message);
      break; 
    }
  } while (nextPageToken);

  console.log(`Lấy video hoàn tất. Tổng số: ${allVideos.length}`);
  return allVideos;
}

async function fetchAllChannelPlaylists() {
  console.log('Bắt đầu lấy danh sách phát (playlist)...');
  let allPlaylists = [];
  let nextPageToken = null;

  const playlistsUrl = 'https://www.googleapis.com/youtube/v3/playlists';
  
  do {
    try {
      const params = {
        part: 'snippet,contentDetails', channelId: CHANNEL_ID, maxResults: MAX_RESULTS_PER_PAGE,
        key: YOUTUBE_API_KEY, pageToken: nextPageToken,
      };
      const response = await axios.get(playlistsUrl, { params });
      allPlaylists.push(...response.data.items);
      console.log(`Đã lấy được ${response.data.items.length} playlist. Tổng cộng: ${allPlaylists.length}`);
      nextPageToken = response.data.nextPageToken;
    } catch (error) {
      console.error("Lỗi khi gọi API playlist:", error.response ? error.response.data.error.message : error.message);
      break;
    }
  } while (nextPageToken);
  
  console.log(`Lấy playlist hoàn tất. Tổng số: ${allPlaylists.length}`);
  return allPlaylists;
}

async function main() {
  try {
    const videos = await fetchAllChannelVideos();
    await fs.writeFile(CATALOG_FILE, JSON.stringify(videos, null, 2));
    console.log(`Đã ghi thành công ${videos.length} video vào file ${CATALOG_FILE}`);

    const playlists = await fetchAllChannelPlaylists();
    await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
    console.log(`Đã ghi thành công ${playlists.length} playlist vào file ${PLAYLISTS_FILE}`);
  } catch (error) {
    console.error("Đã xảy ra lỗi nghiêm trọng:", error.message);
    process.exit(1);
  }
}

main();