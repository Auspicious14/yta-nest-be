# YouTube Video Generation Service

This project is a NestJS application that automates the generation of YouTube videos. It leverages an external Render endpoint to create videos based on a given prompt, and then uploads them to YouTube.

## Features

- **Automated Video Generation**: Provide a prompt and the service will generate a video using an external API.
- **YouTube Integration**: Automatically uploads the generated video to a specified YouTube channel.
- **MongoDB Integration**: Stores job details and video metadata in a MongoDB database.

## Prerequisites

- Node.js (v14 or higher)
- npm
- MongoDB
- A YouTube API key with OAuth 2.0 credentials

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/your-repo-name.git
   cd your-repo-name
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env` file in the root of the project and add the following variables:

   ```env
   MONGO_URI=your_mongodb_connection_string
   YOUTUBE_CLIENT_ID=your_youtube_client_id
   YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
   YOUTUBE_REDIRECT_URI=your_youtube_redirect_uri
   YOUTUBE_REFRESH_TOKEN=your_youtube_refresh_token
   ```

4. **Run the application:**

   ```bash
   npm run start:dev
   ```

The application will be running on `http://localhost:3000`.

## API Endpoints

### Generate a new video

- **POST** `/automate/video`

  This endpoint initiates the video generation process.

  **Request Body:**

  ```json
  {
    "prompt": "A video about the importance of exercise."
  }
  ```

  **Response:**

  The endpoint returns a `Job` object with details about the video generation task.

## How it Works

1. **Script Generation**: The `ScriptService` generates a script, title, description, and tags based on the provided prompt.
2. **Video Generation**: The application sends a request to the Render endpoint (`https://mpt-mkrv.onrender.com/api/v1/videos`) with the prompt and script.
3. **Video Upload**: The generated video is then uploaded to YouTube using the `YoutubeService`.
4. **Database Storage**: The job details, including the video URL and YouTube video ID, are stored in a MongoDB database.

## License

This project is licensed under the MIT License.
