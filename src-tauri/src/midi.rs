//! MIDI inputs: foot pedals and controllers.
//!
//! Every connected input is opened, and inputs plugged in later are picked up within a
//! couple of seconds. Messages that can trigger an action (a note pressed, a controller
//! pushed past half way, a program change) go to the UI as `MidiTrigger` events; the UI
//! decides which action they run. It works with Looplab in the background too.

use std::collections::HashMap;
use std::time::Duration;

use midir::{MidiInput, MidiInputConnection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_specta::Event;

const CLIENT: &str = "Looplab";
const RESCAN: Duration = Duration::from_secs(2);
/// Controllers (pedals send CC 64, 67…) trigger when they cross the middle going up.
const CC_THRESHOLD: u8 = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MidiKind {
    Note,
    Cc,
    Program,
}

/// A MIDI message that can run an action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct MidiTrigger {
    pub kind: MidiKind,
    /// 1..16, as written on devices
    pub channel: u8,
    /// Note, controller or program number
    pub number: u8,
}

/// Turns raw MIDI bytes into a trigger; `cc` remembers controller values to find rising edges.
fn parse(bytes: &[u8], cc: &mut [u8; 16 * 128]) -> Option<MidiTrigger> {
    let (&status, data) = bytes.split_first()?;
    let channel = status & 0x0F;
    let trigger = |kind, number| MidiTrigger {
        kind,
        channel: channel + 1,
        number,
    };
    match (status & 0xF0, data) {
        // Note on with velocity 0 is a note off
        (0x90, [note, velocity, ..]) if *velocity > 0 => Some(trigger(MidiKind::Note, *note)),
        (0xB0, [controller, value, ..]) => {
            let slot = &mut cc[usize::from(channel) * 128 + usize::from(*controller & 0x7F)];
            let rising = *slot < CC_THRESHOLD && *value >= CC_THRESHOLD;
            *slot = *value;
            rising.then(|| trigger(MidiKind::Cc, *controller))
        }
        (0xC0, [program, ..]) => Some(trigger(MidiKind::Program, *program)),
        _ => None,
    }
}

/// Opens every MIDI input, now and whenever a new one appears, and forwards its triggers.
pub fn spawn_midi_listener(app: AppHandle) {
    std::thread::spawn(move || {
        let mut open: HashMap<String, MidiInputConnection<[u8; 16 * 128]>> = HashMap::new();
        loop {
            let Ok(scanner) = MidiInput::new(CLIENT) else {
                std::thread::sleep(RESCAN);
                continue;
            };
            let ports: Vec<(String, midir::MidiInputPort)> = scanner
                .ports()
                .into_iter()
                .filter_map(|port| scanner.port_name(&port).ok().map(|name| (name, port)))
                .collect();
            // Unplugged devices: close their connection
            open.retain(|name, _| ports.iter().any(|(port_name, _)| port_name == name));

            for (name, port) in ports {
                if open.contains_key(&name) {
                    continue;
                }
                let Ok(mut input) = MidiInput::new(CLIENT) else {
                    continue;
                };
                input.ignore(midir::Ignore::All);
                let app = app.clone();
                // A device already taken by another program cannot be opened: try again later
                if let Ok(connection) = input.connect(
                    &port,
                    "looplab-input",
                    move |_, bytes, cc| {
                        if let Some(trigger) = parse(bytes, cc) {
                            let _ = trigger.emit(&app);
                        }
                    },
                    [0; 16 * 128],
                ) {
                    open.insert(name, connection);
                }
            }
            std::thread::sleep(RESCAN);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(messages: &[&[u8]]) -> Vec<MidiTrigger> {
        let mut cc = [0; 16 * 128];
        messages.iter().filter_map(|m| parse(m, &mut cc)).collect()
    }

    #[test]
    fn notes_trigger_on_press_only() {
        let triggers = run(&[&[0x90, 60, 100], &[0x90, 60, 0], &[0x80, 60, 0]]);
        assert_eq!(
            triggers,
            vec![MidiTrigger {
                kind: MidiKind::Note,
                channel: 1,
                number: 60
            }]
        );
    }

    #[test]
    fn a_pedal_triggers_once_per_press() {
        // Sustain pedal on channel 2: down, still down, up, down again
        let triggers = run(&[
            &[0xB1, 64, 127],
            &[0xB1, 64, 127],
            &[0xB1, 64, 0],
            &[0xB1, 64, 127],
        ]);
        assert_eq!(triggers.len(), 2);
        assert_eq!(triggers[0].kind, MidiKind::Cc);
        assert_eq!(triggers[0].channel, 2);
        assert_eq!(triggers[0].number, 64);
    }

    #[test]
    fn program_changes_trigger_and_other_messages_do_not() {
        let triggers = run(&[&[0xC0, 3], &[0xE0, 0, 64], &[0xF8], &[]]);
        assert_eq!(triggers.len(), 1);
        assert_eq!(triggers[0].kind, MidiKind::Program);
        assert_eq!(triggers[0].number, 3);
    }
}
