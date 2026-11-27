use crate::display_mode::DisplayMode;

/// Picks the monitor mode a stream gets when the client wants a resolution and frame rate.
/// The Deck shows the same choice in its profile editor (src/model/PcModeMatcher.ts, keep both alike).
///
/// Size: the exact one, else one with the same aspect ratio (the largest that fits inside the
/// wanted size, else the smallest bigger one), else the largest that fits, else the smallest.
/// Refresh rate: the closest at that size, a tie goes to the higher one.
pub struct DisplayModeChooser;

impl DisplayModeChooser
{
    pub fn choose(modes: &[DisplayMode], width: u32, height: u32, refresh_rate: u32) -> Option<&DisplayMode>
    {
        let (chosen_width, chosen_height) = Self::choose_size(modes, width, height)?;
        let wanted_rate = refresh_rate as f64;
        modes
            .iter()
            .filter(|mode| mode.width == chosen_width && mode.height == chosen_height)
            .min_by(|first, second|
            {
                let first_distance = (first.refresh_rate - wanted_rate).abs();
                let second_distance = (second.refresh_rate - wanted_rate).abs();
                first_distance
                    .total_cmp(&second_distance)
                    .then(second.refresh_rate.total_cmp(&first.refresh_rate))
            })
    }

    fn choose_size(modes: &[DisplayMode], width: u32, height: u32) -> Option<(u32, u32)>
    {
        let mut sizes: Vec<(u32, u32)> = modes.iter().map(|mode| (mode.width, mode.height)).collect();
        sizes.sort_by_key(|&(size_width, size_height)| size_width as u64 * size_height as u64);
        sizes.dedup();

        if sizes.contains(&(width, height))
        {
            return Some((width, height));
        }
        let fits = |&&(size_width, size_height): &&(u32, u32)| size_width <= width && size_height <= height;
        let same_aspect: Vec<(u32, u32)> = sizes
            .iter()
            .copied()
            .filter(|&(size_width, size_height)| Self::same_aspect_ratio(size_width, size_height, width, height))
            .collect();
        if let Some(size) = same_aspect.iter().filter(fits).last()
        {
            return Some(*size);
        }
        if let Some(size) = same_aspect.first()
        {
            return Some(*size);
        }
        if let Some(size) = sizes.iter().filter(fits).last()
        {
            return Some(*size);
        }
        sizes.first().copied()
    }

    /// The mode shows the client's picture without bars: exact size or the same aspect ratio.
    pub fn keeps_picture_shape(mode: &DisplayMode, width: u32, height: u32) -> bool
    {
        (mode.width == width && mode.height == height) || Self::same_aspect_ratio(mode.width, mode.height, width, height)
    }

    /// Within 1 %, so 1366x768 counts as 16:9.
    fn same_aspect_ratio(first_width: u32, first_height: u32, second_width: u32, second_height: u32) -> bool
    {
        let first_ratio = first_width as f64 / first_height as f64;
        let second_ratio = second_width as f64 / second_height as f64;
        (first_ratio - second_ratio).abs() <= second_ratio * 0.01
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    fn modes(mode_texts: &[&str]) -> Vec<DisplayMode>
    {
        mode_texts
            .iter()
            .enumerate()
            .map(|(index, text)|
            {
                let (size, rate) = text.split_once('@').unwrap();
                let (width, height) = size.split_once('x').unwrap();
                DisplayMode { id: index.to_string(), width: width.parse().unwrap(), height: height.parse().unwrap(), refresh_rate: rate.parse().unwrap() }
            })
            .collect()
    }

    fn chosen(mode_texts: &[&str], width: u32, height: u32, refresh_rate: u32) -> String
    {
        DisplayModeChooser::choose(&modes(mode_texts), width, height, refresh_rate).unwrap().text()
    }

    #[test]
    fn takes_the_exact_size_with_the_closest_refresh_rate()
    {
        let available = ["1920x1080@60", "1280x800@60", "1280x800@89.82", "1280x800@120"];
        assert_eq!(chosen(&available, 1280, 800, 90), "1280x800@90");
        assert_eq!(chosen(&available, 1280, 800, 30), "1280x800@60");
        // 60 and 120 are both 30 away from 90: the higher one wins.
        assert_eq!(chosen(&["1280x800@60", "1280x800@120"], 1280, 800, 90), "1280x800@120");
    }

    #[test]
    fn prefers_the_same_aspect_ratio_that_fits()
    {
        let ultrawide = ["3440x1440@165", "2560x1440@144", "1920x1080@120", "1680x1050@60", "1280x720@60", "640x480@60"];
        // 16:10 Deck: 1680x1050 is 16:10 but bigger than 1280x800, nothing 16:10 fits → the smallest 16:10.
        assert_eq!(chosen(&ultrawide, 1280, 800, 90), "1680x1050@60");
        // 16:9 TV: the largest 16:9 that fits.
        assert_eq!(chosen(&ultrawide, 3840, 2160, 60), "2560x1440@144");
        assert_eq!(chosen(&["1366x768@60", "1920x1200@60"], 1920, 1080, 60), "1366x768@60");
    }

    #[test]
    fn falls_back_to_the_largest_that_fits_then_the_smallest()
    {
        let monitor = ["3440x1440@100", "1920x1080@60", "1280x720@60", "1024x768@60"];
        assert_eq!(chosen(&monitor, 1280, 800, 60), "1280x720@60");
        assert_eq!(chosen(&["3440x1440@100", "2560x1080@60"], 1280, 800, 60), "2560x1080@60");
        assert!(DisplayModeChooser::choose(&[], 1280, 800, 60).is_none());
    }

    #[test]
    fn tells_whether_the_picture_keeps_its_shape()
    {
        let ultrawide_modes = modes(&["3440x1440@165", "1280x720@60", "1920x1200@60"]);
        assert!(!DisplayModeChooser::keeps_picture_shape(&ultrawide_modes[0], 1280, 800));
        assert!(!DisplayModeChooser::keeps_picture_shape(&ultrawide_modes[1], 1280, 800));
        assert!(DisplayModeChooser::keeps_picture_shape(&ultrawide_modes[2], 1280, 800));
    }
}
