import { createCanvas, loadImage } from "@napi-rs/canvas";
import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import fs from 'fs/promises'
import path from "path";

@Injectable()

export class ThumbNailService {

    constructor(private readonly httpService: HttpService) { }

    async generate(prompt: string, outputPath?: string): Promise<Buffer> {
        const width = 1280;
        const height = 720;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
    
        // Load background image (or use color fill)
        const bgImage = await loadImage(
          path.join(__dirname, 'assets', 'default-bg.jpg'),
        );
        ctx.drawImage(bgImage, 0, 0, width, height);
    
        // Text styles
        ctx.font = 'bold 60px Sans';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 10;
    
        // Draw prompt/title
        ctx.fillText(prompt, width / 2, height / 2);
    
        const buffer = canvas.toBuffer('image/png');
    
        if (outputPath) {
          fs.writeFile(outputPath, buffer);
        }
    
        return buffer;
      }
        


}