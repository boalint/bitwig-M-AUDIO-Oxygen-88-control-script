loadAPI(2);

host.defineController("M-Audio", "Oxygen 88", "1.0", "7C290E15-04A8-4A16-AD73-96ECF03858E4");

host.defineMidiPorts(1, 1);

host.addDeviceNameBasedDiscoveryPair(["Oxygen 88"], ["Oxygen 88"]);

// Search after different naming-schemes for autodetection
for ( var i = 1; i < 9; i++)
{
	var name = i.toString() + "- Oxygen 88";
	host.addDeviceNameBasedDiscoveryPair([name], [name]);
	host.addDeviceNameBasedDiscoveryPair(["Oxygen 88 MIDI " + i.toString()], ["Oxygen 88 MIDI " + i.toString()]);
}

var TRANS =
{
	PREV_TRACK : 110,
	NEXT_TRACK : 111,
	LOOP       : 113,
	REWIND     : 114,
	FORWARD    : 115,
	STOP       : 116,
	PLAY       : 117,
	RECORD     : 118
};

var LOWEST_FADER = 33;
var HIGHEST_FADER = 40;
var MASTER_FADER = 41;

var LOWEST_ARM = 49;
var HIGHEST_ARM = 56;
var SHIFT_BUTTON = 57;

var LOWEST_KNOB = 17;
var HIGHEST_KNOB = 24;

var isShift = false;
var ON_OFF_MESSAGES = ['OFF', 'ON'];
var MUTE_MESSAGES = ['MUTED', 'LOUD'];
var BUTTON_MESSAGE_MAP = [ON_OFF_MESSAGES, MUTE_MESSAGES];

var noteIn;

function init()
{
	transport = host.createTransport();

	// Register callback for midi-events
	host.getMidiInPort(0).setMidiCallback(onMidi);

	// Keyboard
	noteIn = host.getMidiInPort(0).createNoteInput("Oxygen 88 Keyboard");
	noteIn.setShouldConsumeEvents(false);
	
	// Master track
	masterTrack = host.createMasterTrack(0);
	
	// The cursor
	cursorTrack = host.createCursorTrack(0, 0);
	cursorTrack.name().markInterested();	
	cursorDevice = cursorTrack.createCursorDevice();	
	
	// Knobs 
	remoteControls = cursorDevice.createCursorRemoteControlsPage(8);
	for (var i = 0; i < 8; i++)
	{
		remoteControls.getParameter(i).setIndication(true);
	}
	
	//Pageable tracks
	trackBank = host.createMainTrackBank(8, 0, 0);
	trackBank.followCursorTrack(cursorTrack);
	for (var i = 0; i < 8; i++)
	{
		var bankTrack = trackBank.getChannel(i);
		bankTrack.name().markInterested();
		bankTrack.isActivated().markInterested();
		bankTrack.getMute().markInterested();
	}

}

function idx(b) 
{
	return 0 + b;
}

function onMidi(status, data1, data2)
{
	printMidi(status, data1, data2);

	if (isChannelController(status))
	{
		
		// Handle transport-buttons and track selection
		if ((data1 >= TRANS.PREV_TRACK && data1 <= TRANS.RECORD && data1 != 112) && data2 > 0)
		{
			switch(data1) {
				case TRANS.PREV_TRACK:
				cursorTrack.selectPrevious();
				host.showPopupNotification('Current track: ' + cursorTrack.name().get());
				break;
			case TRANS.NEXT_TRACK:
				cursorTrack.selectNext();
				host.showPopupNotification('Current track: ' + cursorTrack.name().get());
				break;
			case TRANS.LOOP:
				transport.toggleLoop();
				break;
			case TRANS.REWIND:
				transport.rewind();
				break;
			case TRANS.FORWARD:
				transport.fastForward();
				break;
			case TRANS.STOP:
				transport.stop();
				break;
			case TRANS.PLAY:
				transport.play();
				break;
			case TRANS.RECORD:
				//cursorTrack.getArm().toggle();
				transport.record();
				break;
			}
		}
		else
		{
			// Handle fader for track volume
			if (data1 >= LOWEST_FADER && data1 <= HIGHEST_FADER)
			{
				trackBank.getChannel(data1 - LOWEST_FADER).getVolume().set(data2, 128);
			}
			//Handle fader for master volume
			else if (data1 == MASTER_FADER) 
			{
				masterTrack.getVolume().set(data2, 128);
			}
			//Handle arm buttons
			else if (data1 >= LOWEST_ARM && data1 <= HIGHEST_ARM && data2 > 0) 
			{
				var currentTrack = trackBank.getChannel(data1 - LOWEST_ARM);
				var currentTrackValueHolder = isShift
					? currentTrack.getMute()
					: currentTrack.isActivated();
				var newValue = !currentTrackValueHolder.get();
				var isOn = isShift != newValue; //logical XOR
				if (!isOn) {
					noteIn.sendRawMidiEvent(176, 64, 0); //send sustain off
				}
				currentTrackValueHolder.set(newValue);
				host.showPopupNotification(currentTrack.name().get() + ' ' + BUTTON_MESSAGE_MAP[idx(isShift)][idx(isOn)]);
			}
			//Handle shift button
			else if (data1 == SHIFT_BUTTON && data2 > 0) 
			{
				isShift = !isShift;
				host.showPopupNotification('Shift ' + ON_OFF_MESSAGES[idx(isShift)]);
			}
			else
			{
				// Handle knobs
				if (data1 >= LOWEST_KNOB && data1 <= HIGHEST_KNOB)
				{
					var knobIndex = data1 - LOWEST_KNOB;
					knobParameter = remoteControls.getParameter(knobIndex);
					knobParameter.getAmount().set(data2, 128);
				}
			}
		}
	}
}

function exit()
{
}