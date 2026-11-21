use serde::Deserialize;

/// Everything needed to start one Moonlight stream, sent by the frontend.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoonlightCommand
{
    /// Program plus fixed leading arguments, e.g. ["flatpak", "run", "com.moonlight_stream.Moonlight"].
    pub base_command: Vec<String>,
    pub host: String,
    pub app_name: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate_mbps: u32,
    pub codec: String,
    pub hdr: bool,
    pub audio: String,
    /// Moonlight's own stats overlay (FPS, latency, dropped frames); Select+L1+R1+X toggles it in the stream.
    pub performance_overlay: bool,
}

impl MoonlightCommand
{
    /// Builds the full argument list, program first.
    pub fn to_arguments(&self) -> Vec<String>
    {
        let mut arguments = self.base_command.clone();

        arguments.push("stream".into());
        arguments.push(self.host.clone());
        arguments.push(self.app_name.clone());
        arguments.push("--resolution".into());
        arguments.push(format!("{}x{}", self.width, self.height));
        arguments.push("--fps".into());
        arguments.push(self.fps.to_string());
        arguments.push("--bitrate".into());
        arguments.push((self.bitrate_mbps * 1000).to_string());
        arguments.push("--video-codec".into());
        arguments.push(self.codec.clone());
        arguments.push(if self.hdr { "--hdr".into() } else { "--no-hdr".into() });
        arguments.push("--audio-config".into());
        arguments.push(Self::audio_option(&self.audio).into());
        arguments.push(if self.performance_overlay
        {
            "--performance-overlay".into()
        }
        else
        {
            "--no-performance-overlay".into()
        });
        arguments.push("--display-mode".into());
        arguments.push("fullscreen".into());

        arguments
    }

    /// Human readable command line for logs and error messages.
    pub fn to_display_string(&self) -> String
    {
        self.to_arguments()
            .iter()
            .map(|argument|
            {
                if argument.contains(' ') { format!("\"{}\"", argument) } else { argument.clone() }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Maps the UI audio label to Moonlight's --audio-config value.
    fn audio_option(audio_label: &str) -> &'static str
    {
        match audio_label
        {
            "5.1 Surround" => "5.1-surround",
            "7.1 Surround" => "7.1-surround",
            _ => "stereo",
        }
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    #[test]
    fn builds_moonlight_arguments_from_mode()
    {
        let command = MoonlightCommand
        {
            base_command: vec!["flatpak".into(), "run".into(), "com.moonlight_stream.Moonlight".into()],
            host: "gaming-pc".into(),
            app_name: "Elden Ring".into(),
            width: 2560,
            height: 1440,
            fps: 120,
            bitrate_mbps: 60,
            codec: "HEVC".into(),
            hdr: true,
            audio: "5.1 Surround".into(),
            performance_overlay: true,
        };

        assert_eq!(
            command.to_display_string(),
            "flatpak run com.moonlight_stream.Moonlight stream gaming-pc \"Elden Ring\" --resolution 2560x1440 \
             --fps 120 --bitrate 60000 --video-codec HEVC --hdr --audio-config 5.1-surround --performance-overlay --display-mode fullscreen"
        );
    }

    #[test]
    fn switches_the_performance_overlay_off()
    {
        let command = MoonlightCommand
        {
            base_command: vec!["moonlight".into()],
            host: "gaming-pc".into(),
            app_name: "Desktop".into(),
            width: 1280,
            height: 800,
            fps: 60,
            bitrate_mbps: 15,
            codec: "HEVC".into(),
            hdr: false,
            audio: "Stereo".into(),
            performance_overlay: false,
        };

        assert!(command.to_arguments().contains(&"--no-performance-overlay".to_string()));
    }
}
