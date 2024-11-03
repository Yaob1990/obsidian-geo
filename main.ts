import { exec } from "child_process";
import { Plugin, TFile } from "obsidian";
import { promisify } from "util";

const execAsync = promisify(exec);

export default class LocationPlugin extends Plugin {
	async onload() {
		// 等待布局加载完成后再注册事件监听
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on("create", async (file) => {
					if (file instanceof TFile && file.extension === "md") {
						console.log("新建文件事件触发");
						await this.addLocationToNote(file);
					}
				})
			);
		});
	}

	async addLocationToNote(file: TFile) {
		try {
			console.log("执行快捷指令获取位置");
			let retries = 3;
			let lastError;

			while (retries > 0) {
				try {
					const { stdout, stderr } = await execAsync(
						'echo "{LAT},{LON}" | shortcuts run "Get Location" -i - | tee',
						{ timeout: 10000 }
					);

					if (stderr) {
						console.error("获取位置错误:", stderr);
						return;
					}

					// 读取现有内容
					const currentContent = await this.app.vault.read(file);

					// 准备新的位置信息
					const locationData = stdout.trim();

					// 检查是否已有 frontmatter
					let newContent;
					if (currentContent.startsWith("---\n")) {
						// 已有 frontmatter，在其中添加或更新 location
						const [frontmatter, ...contentParts] =
							currentContent.split("---\n");
						const updatedFrontmatter = frontmatter.includes(
							"location:"
						)
							? frontmatter.replace(
									/location:.*(\r\n|\r|\n)/,
									`location: "${locationData}"\n`
							  )
							: frontmatter + `location: "${locationData}"\n`;
						newContent = [updatedFrontmatter, ...contentParts].join(
							"---\n"
						);
					} else {
						// 没有 frontmatter，创建新的
						newContent = `---\nlocation: "${locationData}"\n---\n${currentContent}`;
					}

					// 更新文件内容
					await this.app.vault.modify(file, newContent);
					return;
				} catch (error) {
					lastError = error;
					retries--;
					if (retries > 0) {
						await new Promise((resolve) =>
							setTimeout(resolve, 1000)
						);
						console.log(
							`重试获取位置信息，剩余尝试次数: ${retries}`
						);
					}
				}
			}

			throw lastError;
		} catch (error) {
			console.error("执行快捷指令失败:", error);
		}
	}
}
