// update.js (PHIÊN BẢN NÂNG CẤP - LẤY TẤT CẢ VIDEO)
const fs = require('fs/promises');
const axios = require('axios');

// --- PHẦN BÁC CẦN KIỂM TRA LẠI ---
// Đảm bảo đây là Channel ID đúng của bác
const CHANNEL_ID = 'UC7EYRP--kBfvu1y84p2sFcA';
// ----------------------------------

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Lấy API Key từ GitHub Secrets, không cần sửa
const MAX_RESULTS_PER_PAGE = 50;
const CATALOG_FILE = 'catalog.json';
const PLAYLISTS_FILE = 'playlists.json';

if (!YOUTUBE_API_KEY) {
  throw new Error("Lỗi: Không tìm thấy YOUTUBE_API_KEY. Bác đã cấu hình GitHub Secrets chưa?");
}

// Hàm lấy ID của playlist "Uploads" (chứa tất cả video) từ Channel ID
async function getUploadsPlaylistId() {
  console.log('Đang tìm ID của kho chứa video tổng...');
  const url = `https://www.googleapis.com/youtube/v3/channels`;
  try {
    const response = await axios.get(url, {
      params: {
        part: 'contentDetails',
        id: CHANNEL_ID,
        key: YOUTUBE_API_KEY,
      },
    });
    const playlistId = response.data.items[0].contentDetails.relatedPlaylists.uploads;
    console.log(`Đã tìm thấy ID kho video tổng: ${playlistId}`);
    return playlistId;
  } catch (error) {
    console.error("Lỗi khi tìm kho video tổng:", error.response ? error.response.data.error.message : error.message);
    throw error;
  }
}

// Hàm lấy tất cả video từ một kênh (phiên bản nâng cấp)
async function fetchAllChannelVideos() {
  const uploadsPlaylistId = await getUploadsPlaylistId();
  if (!uploadsPlaylistId) {
    console.log("Không tìm thấy kho video tổng, dừng lại.");
    return [];
  }

  console.log('Bắt đầu kiểm kê tất cả video trong kho tổng...');
  let allVideoItems = [];
  let nextPageToken = null;

  // 1. Lấy danh sách ID của tất cả video trong playlist "Uploads"
  do {
    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        params: {
          part: 'snippet',
          playlistId: uploadsPlaylistId,
          maxResults: MAX_RESULTS_PER_PAGE,
          key: YOUTUBE_API_KEY,
          pageToken: nextPageToken,
        },
      });
      allVideoItems.push(...response.data.items);
      console.log(`Đã kiểm kê được ${response.data.items.length} video. Tổng số: ${allVideoItems.length}`);
      nextPageToken = response.data.nextPageToken;
    } catch (error) {
      console.error("Lỗi khi đang kiểm kê video:", error.response ? error.response.data.error.message : error.message);
      break;
    }
  } while (nextPageToken);

  console.log(`Kiểm kê hoàn tất. Tổng cộng có ${allVideoItems.length} video. Bắt đầu lấy thông tin chi tiết...`);
  const videoIds = allVideoItems.map(item => item.snippet.resourceId.videoId);

  // 2. Lấy thông tin chi tiết (bao gồm lượt xem, bình luận...) cho tất cả video
  let allVideosWithDetails = [];
  // Chia danh sách ID thành các nhóm nhỏ (mỗi nhóm 50 ID) để hỏi YouTube cho nhanh
  for (let i = 0; i < videoIds.length; i += MAX_RESULTS_PER_PAGE) {
    const chunk = videoIds.slice(i, i + MAX_RESULTS_PER_PAGE);
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'snippet,statistics',
                id: chunk.join(','),
                key: YOUTUBE_API_KEY,
            }
        });
        allVideosWithDetails.push(...response.data.items);
        console.log(`Đã lấy thông tin chi tiết cho ${response.data.items.length} video. Tổng cộng: ${allVideosWithDetails.length}`);
    } catch (error) {
        console.error("Lỗi khi lấy thông tin chi tiết:", error.response ? error.response.data.error.message : error.message);
    }
  }

  console.log(`Lấy thông tin chi tiết hoàn tất. Tổng số video: ${allVideosWithDetails.length}`);
  return allVideosWithDetails;
}

// Hàm lấy tất cả playlist từ một kênh (giữ nguyên, không đổi)
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
    // Sắp xếp lại video theo ngày đăng mới nhất -> cũ nhất
    videos.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
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
