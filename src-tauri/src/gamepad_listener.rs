use std::thread;
use std::time::Duration;

use gilrs::{Axis, Button, EventType, Gilrs};
use tauri::{AppHandle, Emitter};

/// Reads controllers natively (WebKitGTK's Gamepad API is unreliable) and emits
/// "pad-button" events with the launcher's button names (A, B, X, Y, L1, R1, MENU, UP, ...).
pub struct GamepadListener;

impl GamepadListener
{
    const STICK_THRESHOLD: f32 = 0.6;

    pub fn start(app_handle: AppHandle)
    {
        thread::spawn(move ||
        {
            let mut gilrs = match Gilrs::new()
            {
                Ok(gilrs) => gilrs,
                Err(error) =>
                {
                    eprintln!("[gamepad] gilrs unavailable: {}", error);
                    return;
                }
            };

            // Remembers the last stick direction so a held stick fires only once.
            let mut stick_direction_x = 0;
            let mut stick_direction_y = 0;

            loop
            {
                while let Some(event) = gilrs.next_event()
                {
                    let button_name = match event.event
                    {
                        EventType::ButtonPressed(button, _) => Self::button_name(button),
                        EventType::AxisChanged(Axis::LeftStickX, value, _) =>
                        {
                            Self::stick_edge(value, &mut stick_direction_x, "LEFT", "RIGHT")
                        }
                        // gilrs reports stick up as positive Y.
                        EventType::AxisChanged(Axis::LeftStickY, value, _) =>
                        {
                            Self::stick_edge(value, &mut stick_direction_y, "DOWN", "UP")
                        }
                        _ => None,
                    };

                    if let Some(button_name) = button_name
                    {
                        let _ = app_handle.emit("pad-button", button_name);
                    }
                }
                thread::sleep(Duration::from_millis(8));
            }
        });
    }

    fn button_name(button: Button) -> Option<&'static str>
    {
        match button
        {
            Button::South => Some("A"),
            Button::East => Some("B"),
            Button::West => Some("X"),
            Button::North => Some("Y"),
            Button::LeftTrigger => Some("L1"),
            Button::RightTrigger => Some("R1"),
            Button::Start => Some("MENU"),
            Button::DPadUp => Some("UP"),
            Button::DPadDown => Some("DOWN"),
            Button::DPadLeft => Some("LEFT"),
            Button::DPadRight => Some("RIGHT"),
            _ => None,
        }
    }

    /// Fires once when the stick crosses the threshold, not while it is held.
    fn stick_edge(value: f32, last_direction: &mut i32, negative_name: &'static str, positive_name: &'static str) -> Option<&'static str>
    {
        let direction = if value > Self::STICK_THRESHOLD
        {
            1
        }
        else if value < -Self::STICK_THRESHOLD
        {
            -1
        }
        else
        {
            0
        };

        if direction == *last_direction
        {
            return None;
        }
        *last_direction = direction;

        match direction
        {
            1 => Some(positive_name),
            -1 => Some(negative_name),
            _ => None,
        }
    }
}
