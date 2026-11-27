/// One step of a monitor switch: a command, and the state the outputs must reach before the next
/// step runs. Switching in steps keeps at least one monitor on at every moment; switching
/// everything in one call left KWin without an output for a moment and hanging afterwards.
#[derive(Debug, Clone, PartialEq)]
pub struct DisplayStep
{
    /// Program first, e.g. ["kscreen-doctor", "output.DP-3.enable", …].
    pub command: Vec<String>,
    /// (output name, enabled, mode id when enabled) the backend must report after the step.
    /// Empty = only check that the desktop still answers.
    pub expected: Vec<(String, bool, Option<String>)>,
}

impl DisplayStep
{
    /// "kscreen-doctor output.DP-3.enable …", for the log and dry runs.
    pub fn text(&self) -> String
    {
        self.command.join(" ")
    }
}
