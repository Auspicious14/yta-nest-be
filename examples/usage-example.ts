/**
 * Example usage of the YouTube Video Automation API
 *
 * This script demonstrates how to:
 * 1. Create a video generation job
 * 2. Poll for job status
 * 3. Retrieve the final YouTube URL
 */

const API_BASE_URL = "http://localhost:23000";

/**
 * Create a new video generation job
 */
async function createVideoJob(prompt: string) {
  const response = await fetch(`${API_BASE_URL}/automate/video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create job: ${response.statusText}`);
  }

  const job = await response.json();
  console.log("✅ Job created:", job._id);
  console.log("📝 Prompt:", job.prompt);
  console.log("⏳ Status:", job.status);

  return job;
}

/**
 * Get job status by ID
 */
async function getJobStatus(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/automate/video/${jobId}`);

  if (!response.ok) {
    throw new Error(`Failed to get job status: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Poll job status until completion
 */
async function waitForJobCompletion(jobId: string, maxWaitTime = 600000) {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  console.log("\n⏳ Waiting for job to complete...\n");

  while (Date.now() - startTime < maxWaitTime) {
    const job = await getJobStatus(jobId);

    console.log(`Status: ${job.status}`);

    if (job.status === "completed") {
      console.log("\n✅ Job completed successfully!");
      console.log("📹 Video URL:", job.finalVideoUrl);
      console.log("🎬 YouTube URL:", job.youtubeVideoUrl);
      console.log("📊 Video Details:");
      console.log("  - Title:", job.videoDetails.title);
      console.log("  - Description:", job.videoDetails.description);
      console.log("  - Tags:", job.videoDetails.tags.join(", "));
      return job;
    }

    if (job.status === "failed") {
      console.error("\n❌ Job failed!");
      console.error("Error:", job.errorMessage);
      throw new Error(job.errorMessage);
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Job timed out");
}

/**
 * List all jobs
 */
async function listAllJobs() {
  const response = await fetch(`${API_BASE_URL}/automate/video`);

  if (!response.ok) {
    throw new Error(`Failed to list jobs: ${response.statusText}`);
  }

  const jobs = await response.json();

  console.log(`\n📋 Total jobs: ${jobs.length}\n`);

  jobs.forEach((job: any, index: number) => {
    console.log(`${index + 1}. ${job.prompt}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   ID: ${job._id}`);
    if (job.youtubeVideoUrl) {
      console.log(`   YouTube: ${job.youtubeVideoUrl}`);
    }
    console.log("");
  });

  return jobs;
}

/**
 * Main example function
 */
async function main() {
  try {
    console.log("🚀 YouTube Video Automation - Example Usage\n");
    console.log("=".repeat(50));

    // Example 1: Create a new video
    const prompt = "Top 5 most dangerous animals in the ocean";
    console.log("\n📝 Creating video with prompt:", prompt);

    const job = await createVideoJob(prompt);

    // Example 2: Wait for completion
    await waitForJobCompletion(job._id);

    // Example 3: List all jobs
    console.log("\n" + "=".repeat(50));
    console.log("\n📋 Listing all jobs:");
    await listAllJobs();
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export functions for use in other scripts
export { createVideoJob, getJobStatus, waitForJobCompletion, listAllJobs };
