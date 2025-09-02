// update.js (PHIÊN BẢN HOÀN THIỆN - TỰ ĐỘNG THỬ LẠI & KIỂM TRA)
const fs = require('fs/promises');
const axios = require('axios');

// --- CẤU HÌNH ---
const CHANNEL_ID = 'UC7EYRP--kBfvu1y84p2sFcA';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// <<< CÁC THAM SỐ MỚI ĐỂ KIỂM SOÁT VIỆC THỬ LẠI >>>
const MINIMUM_EXPECTED_VIDEOS = 800; // Số video tối thiểu mong đợi, nếu thấp hơn sẽ thử lại
const MAX_ATTEMPTS = 3; // Số lần thử tối đa (1 lần chính + 2 lần thử lại)
const RETRY_DELAY_MS = 5000; // Chờ 5 giây giữa các lần thử

// --- CÁC HẰNG SỐ FILE ---
const CATALOG_FILE = 'catalog.json';
const PLAYLISTS_FILE = 'playlists.json';

// --- KIỂM TRA BAN ĐẦU ---
if (!YOUTUBE_API_KEY) {
  throw new Error("Lỗi: Không tìm thấy YOUTUBE_API_KEY. Bạn đã cấu hình GitHub Secrets chưa?");
}

// <<< HÀM HỖ TRỢ MỚI >>>
// Hàm tạm dừng thực thi trong một khoảng thời gian
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Hàm lấy ID của playlist "Uploads" (không thay đổi)
async function getUploadsPlaylistId() {
  console.log('Đang tìm ID của kho chứa video tổng...');
  const url = `https://www.googleapis.com/youtube/v3/channels`;
  try {
    const response = await axios.get(url, {
      params: { part: 'contentDetails', id: CHANNEL_ID, key: YOUTUBE_API_KEY },
    });
    const playlistId = response.data.items[0].contentDetails.relatedPlaylists.uploads;
    console.log(`=> Đã tìm thấy ID kho video tổng: ${playlistId}`);
    return playlistId;
  } catch (error) {
    console.error("Lỗi khi tìm kho video tổng:", error.response?.data?.error?.message || error.message);
    throw error;
  }
}

// Hàm lấy tất cả video từ một kênh (không thay đổi)
async function fetchAllChannelVideos(uploadsPlaylistId) {
  console.log('Bắt đầu kiểm kê tất cả video trong kho tổng...');
  let allVideoItems = [];
  let nextPageToken = null;

  // 1. Lấy danh sách ID của tất cả video
  do {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        part: 'snippet', playlistId: uploadsPlaylistId, maxResults: 50,
        key: YOUTUBE_API_KEY, pageToken: nextPageToken,
      },
    });
    allVideoItems.push(...response.data.items);
    console.log(`   - Đã kiểm kê được ${response.data.items.length} video. Tổng số tạm thời: ${allVideoItems.length}`);
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  console.log(`=> Kiểm kê hoàn tất. Tổng cộng có ${allVideoItems.length} video. Bắt đầu lấy thông tin chi tiết...`);
  const videoIds = allVideoItems.map(item => item.snippet.resourceId.videoId).filter(Boolean);

  // 2. Lấy thông tin chi tiết
  let allVideosWithDetails = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: { part: 'snippet,statistics', id: chunk.join(','), key: YOUTUBE_API_KEY }
    });
    allVideosWithDetails.push(...response.data.items);
  }

  console.log(`=> Lấy thông tin chi tiết hoàn tất. Tổng số video cuối cùng: ${allVideosWithDetails.length}`);
  return allVideosWithDetails;
}

// Hàm lấy tất cả playlist từ một kênh (không thay đổi)
async function fetchAllChannelPlaylists() {
  console.log('Bắt đầu lấy danh sách phát (playlist)...');
  let allPlaylists = [];
  let nextPageToken = null;
  do {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
      params: {
        part: 'snippet,contentDetails', channelId: CHANNEL_ID, maxResults: 50,
        key: YOUTUBE_API_KEY, pageToken: nextPageToken,
      },
    });
    allPlaylists.push(...response.data.items);
    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);
  console.log(`=> Lấy playlist hoàn tất. Tổng số: ${allPlaylists.length}`);
  return allPlaylists;
}


// <<< HÀM MAIN ĐƯỢC NÂNG CẤP VỚI LOGIC THỬ LẠI >>>
async function main() {
  let videos = [];
  let uploadsPlaylistId = null;

  // Vòng lặp thử lại việc lấy video
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n--- BẮT ĐẦU LẤY DỮ LIỆU VIDEO (LẦN THỬ ${attempt}/${MAX_ATTEMPTS}) ---`);
    try {
      // Chỉ lấy playlist ID ở lần đầu tiên
      if (!uploadsPlaylistId) {
        uploadsPlaylistId = await getUploadsPlaylistId();
      }

      if (uploadsPlaylistId) {
        videos = await fetchAllChannelVideos(uploadsPlaylistId);
      }

      // KIỂM TRA SỰ HỢP LÝ
      if (videos.length >= MINIMUM_EXPECTED_VIDEOS) {
        console.log(`\n[THÀNH CÔNG] Lấy được ${videos.length} video, đạt yêu cầu tối thiểu.`);
        break; // Thoát khỏi vòng lặp vì đã thành công
      } else {
        console.warn(`[CẢNH BÁO] Chỉ lấy được ${videos.length} video, thấp hơn mức mong đợi (${MINIMUM_EXPECTED_VIDEOS}).`);
        if (attempt < MAX_ATTEMPTS) {
          console.log(`   -> Sẽ thử lại sau ${RETRY_DELAY_MS / 1000} giây...`);
          await sleep(RETRY_DELAY_MS);
        }
      }
    } catch (error) {
      console.error(`[LỖI] Gặp lỗi trong lần thử ${attempt}:`, error.response?.data?.error?.message || error.message);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`   -> Sẽ thử lại sau ${RETRY_DELAY_MS / 1000} giây...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // KIỂM TRA CUỐI CÙNG: Nếu sau tất cả các lần thử vẫn không thành công, báo lỗi
  if (videos.length < MINIMUM_EXPECTED_VIDEOS) {
    throw new Error(`Thất bại sau ${MAX_ATTEMPTS} lần thử. Không thể lấy đủ số lượng video tối thiểu.`);
  }

  // Nếu thành công, tiến hành ghi file video và lấy playlist song song
  console.log('\n--- BẮT ĐẦU GHI FILE VÀ LẤY PLAYLIST ---');
  
  const writeVideosTask = (async () => {
    videos.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
    await fs.writeFile(CATALOG_FILE, JSON.stringify(videos, null, 2));
    console.log(`=> Đã ghi thành công ${videos.length} video vào file ${CATALOG_FILE}`);
  })();

  const writePlaylistsTask = (async () => {
    try {
      const playlists = await fetchAllChannelPlaylists();
      await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
      console.log(`=> Đã ghi thành công ${playlists.length} playlist vào file ${PLAYLISTS_FILE}`);
    } catch (error) {
      console.error("Lỗi nghiêm trọng khi lấy và ghi playlists:", error.message);
    }
  })();

  // Chờ cả hai tác vụ hoàn thành
  await Promise.all([writeVideosTask, writePlaylistsTask]);

  console.log('\n*** HOÀN TẤT TOÀN BỘ QUÁ TRÌNH CẬP NHẬT! ***');
}

main().catch(error => {
  console.error("\n*** SCRIPT KẾT THÚC VỚI LỖI NGHIÊM TRỌNG: ***", error.message);
  process.exit(1); // Thoát với mã lỗi để GitHub Actions báo thất bại
});
