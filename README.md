# YouTube Video Automation (YTA) Backend

A fully automated YouTube video generation system that creates and uploads videos from simple text prompts. The system uses **Gemini AI** for script generation, an external **MPT microservice** for video creation, and the **YouTube Data API** for automatic uploads.

## 🎯 Features

- **Automated Script Generation**: Uses Google's Gemini AI to generate engaging YouTube scripts from prompts
- **Video Generation**: Leverages the MPT (Money Printer Turbo) microservice for professional video creation
- **YouTube Integration**: Automatically uploads generated videos to YouTube with metadata
- **Asynchronous Processing**: Non-blocking job processing with real-time status tracking
- **MongoDB Storage**: Persistent job tracking and video metadata storage
- **RESTful API**: Clean, well-documented API endpoints

## 🏗️ System Architecture

```
User Prompt → Gemini AI (Script) → MPT Service (Video) → YouTube API (Upload) → Completed Video
                    ↓                      ↓                    ↓
                MongoDB Job Tracking (Status: pending → processing → completed/failed)
```

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **MongoDB** (local or cloud instance)
- **Gemini API Key** ([Get one here](https://makersuite.google.com/app/apikey))
- **YouTube OAuth 2.0 Credentials** ([Google Cloud Console](https://console.cloud.google.com/))

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd yta-be
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=23000

# MongoDB
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/yta?retryWrites=true&w=majority

# Gemini AI (for script generation)
GEMINI_API_KEY=your_gemini_api_key_here

# YouTube API
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:23000/oauth2callback
YOUTUBE_REFRESH_TOKEN=your_youtube_refresh_token

# Optional: File Storage
UPLOADS_DIR=./uploads
FINAL_DIR=./uploads/finals
```

### 4. Get YouTube Refresh Token

Before you can upload videos, you need to obtain a YouTube refresh token:

1. Run the server: `npm run start:dev`
2. Visit the OAuth consent URL (check server logs)
3. Authorize the application
4. Copy the refresh token from the response
5. Add it to your `.env` file as `YOUTUBE_REFRESH_TOKEN`

### 5. Run the Application

**Development Mode:**

```bash
npm run start:dev
```

**Production Mode:**

```bash
npm run build
npm run start:prod
```

The server will start on `http://localhost:23000`

## 📡 API Endpoints

### 1. Generate Video

**POST** `/automate/video`

Creates a new video generation job. Returns immediately with job details while processing continues in the background.

**Request Body:**

```json
{
  "prompt": "Top 5 animals that can defeat a lion"
}
```

**Response:**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "prompt": "Top 5 animals that can defeat a lion",
  "status": "pending",
  "videoDetails": {
    "title": "",
    "description": "",
    "tags": []
  },
  "startTime": "2025-12-22T12:34:56.789Z",
  "createdAt": "2025-12-22T12:34:56.789Z",
  "updatedAt": "2025-12-22T12:34:56.789Z"
}
```

### 2. Get Job Status

**GET** `/automate/video/:id`

Retrieves the current status of a video generation job.

**Response:**

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "prompt": "Top 5 animals that can defeat a lion",
  "status": "completed",
  "script": "Generated script content...",
  "videoDetails": {
    "title": "Top 5 Animals That Can Defeat a Lion",
    "description": "Discover the most powerful animals...",
    "tags": ["animals", "lion", "wildlife", "nature", "predators"]
  },
  "finalVideoUrl": "https://cloudinary.com/...",
  "youtubeVideoId": "dQw4w9WgXcQ",
  "youtubeVideoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "startTime": "2025-12-22T12:34:56.789Z",
  "endTime": "2025-12-22T12:38:23.456Z",
  "createdAt": "2025-12-22T12:34:56.789Z",
  "updatedAt": "2025-12-22T12:38:23.456Z"
}
```

### 3. List All Jobs

**GET** `/automate/video`

Retrieves a list of all video generation jobs (most recent first, limited to 100).

**Response:**

```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "prompt": "Top 5 animals that can defeat a lion",
    "status": "completed",
    ...
  },
  {
    "_id": "507f1f77bcf86cd799439012",
    "prompt": "History of ancient Rome",
    "status": "processing",
    ...
  }
]
```

## 📊 Job Status Flow

Jobs progress through the following statuses:

1. **pending** - Job created, waiting to start
2. **processing** - Actively generating script, video, or uploading
3. **completed** - Video successfully uploaded to YouTube
4. **failed** - An error occurred (check `errorMessage` field)

## 🔧 How It Works

### Step-by-Step Process

1. **User submits a prompt** via POST `/automate/video`
2. **Job is created** and saved to MongoDB with status `pending`
3. **API returns immediately** with job ID for tracking
4. **Background processing begins:**
   - Status changes to `processing`
   - **Gemini AI** generates script, title, description, and tags
   - **MPT microservice** creates video from script
   - **YouTube API** uploads the final video
   - Status changes to `completed` or `failed`
5. **User can poll** GET `/automate/video/:id` to check progress

### Services Used

- **Gemini AI (Google)**: Script and metadata generation
- **MPT Microservice**: Video generation from script ([GitHub](https://github.com/auspicious14/mpt))
- **YouTube Data API v3**: Video upload and publishing
- **MongoDB**: Job tracking and persistence

## 🛠️ Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: MongoDB with Mongoose
- **AI**: Google Gemini 1.5 Flash
- **Video Generation**: MPT Microservice (Render)
- **Upload**: YouTube Data API v3
- **HTTP Client**: Axios

## 📁 Project Structure

```
yta-be/
├── src/
│   ├── schemas/           # MongoDB schemas (Job, VideoDetails)
│   ├── shared/            # Shared services
│   │   ├── gemini/        # Gemini AI service
│   │   ├── script/        # Script generation service
│   │   ├── utility/       # Utility functions
│   │   └── ...
│   ├── types/             # TypeScript types and enums
│   ├── video/             # Video controller and YouTube service
│   │   ├── video.controller.ts
│   │   ├── video.service.ts (YouTube)
│   │   └── video.module.ts
│   ├── app.module.ts      # Main application module
│   └── main.ts            # Application entry point
├── .env                   # Environment variables
├── package.json
└── README.md
```

## 🔐 Security Notes

- **Never commit `.env` file** to version control
- Store sensitive credentials securely
- Use environment-specific `.env` files for production
- Rotate API keys regularly
- Implement rate limiting for production use

## 🐛 Troubleshooting

### "GEMINI_API_KEY is required"

- Ensure `GEMINI_API_KEY` is set in your `.env` file
- Get a key from [Google AI Studio](https://makersuite.google.com/app/apikey)

### "YouTube refresh token missing"

- Complete the OAuth flow to get a refresh token
- Add it to `.env` as `YOUTUBE_REFRESH_TOKEN`

### "No video URL returned from MPT service"

- The MPT microservice may be slow or down
- Check [https://mpt-mkrv.onrender.com](https://mpt-mkrv.onrender.com) status
- Render free tier may have cold starts (wait 1-2 minutes)

### MongoDB Connection Issues

- Verify `MONGODB_URL` is correct
- Check network/firewall settings
- Ensure MongoDB cluster allows connections from your IP

## 📈 Performance Tips

- **MPT Service**: First request may be slow due to cold start (~1-2 min)
- **Gemini API**: Has rate limits; implement exponential backoff (already included)
- **YouTube Upload**: Large videos take time; monitor via job status
- **MongoDB**: Index frequently queried fields for better performance

## 🚧 Future Enhancements

- [ ] Add thumbnail generation with AI
- [ ] Support for multiple video styles/templates
- [ ] Webhook notifications when jobs complete
- [ ] Video scheduling for future uploads
- [ ] Analytics dashboard
- [ ] Batch video generation
- [ ] Custom voice selection for narration

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For issues or questions, please open an issue on GitHub.

---

**Built with ❤️ using NestJS, Gemini AI, and YouTube API**
