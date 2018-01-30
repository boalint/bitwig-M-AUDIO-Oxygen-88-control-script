loadAPI(2);

const OXYGEN_88 = {
    VENDOR          : 'M-Audio',
    NAME            : 'Oxygen 88',
    VERSION         : '1.4',
    UUID            : '7C290E15-04A8-4A16-AD73-96ECF03858E4',
    INPUT_COUNT     : 1,
    OUTPUT_COUNT    : 1
};

const MIDI = 'MIDI';

host.defineController(OXYGEN_88.VENDOR, OXYGEN_88.NAME, OXYGEN_88.VERSION, OXYGEN_88.UUID);
host.defineMidiPorts(OXYGEN_88.INPUT_COUNT, OXYGEN_88.OUTPUT_COUNT);
host.addDeviceNameBasedDiscoveryPair([OXYGEN_88.NAME], [OXYGEN_88.NAME]);

// Search after different naming-schemes for autodetection
for ( var i = 1; i < 9; i++) {
    var strI = i.toString();
    
    var name1 = strI + '- ' + OXYGEN_88.NAME;
    host.addDeviceNameBasedDiscoveryPair([name1], [name1]);
    
    var name2 = OXYGEN_88.NAME + ' ' + MIDI + ' ' + strI;
    host.addDeviceNameBasedDiscoveryPair([name2], [name2]);
}

const TRANSPORT = {
    PREV_TRACK      : 110,
    NEXT_TRACK      : 111,
    LOOP            : 113,
    REWIND          : 114,
    FORWARD         : 115,
    STOP            : 116,
    PLAY            : 117,
    RECORD          : 118
};

const FADER = {
    LOW             : 33,
    HIGH            : 40,
    COUNT           : 8,
    
    MASTER          : 41
};

const KNOB = {
    LOW             : 17,
    HIGH            : 24,
    COUNT           : 8
};

const BUTTON = {
    LOW             : 49,
    HIGH            : 56,
    SHIFT           : 57
}

const MESSAGES = {
    ON_OFF          : ['OFF', 'ON'],
    MUTE            : ['MUTED', 'LOUD'],
};

const BUTTON_MESSAGE_MAP = [MESSAGES.ON_OFF, MESSAGES.MUTE];

const D2 = 128;
const S_CC_UNDEFINED = 176;

const CC_BREATH = 2;
const CC_EXPRESSION = 11;
const CC_SUSTAIN = 64;

var isShift = false;
var noteIn;
var cursorTrack;

function cursorTrackPositionObserver(pos) {
    host.showPopupNotification('Current track: ['
        + (pos + 1)
        + '] '
        + cursorTrack.name().get()); //behind the curtain: name is updated before position
}

function init()
{
    transport = host.createTransport();

    // Register callback for midi-events
    host.getMidiInPort(0).setMidiCallback(onMidi);

    // Keyboard
    noteIn = host.getMidiInPort(0).createNoteInput(OXYGEN_88.NAME + ' Keyboard');
    noteIn.setShouldConsumeEvents(false);

    // Master track
    masterTrack = host.createMasterTrack(0);

    // The cursor
    cursorTrack = host.createCursorTrack(0, 0);
    cursorTrack.name().markInterested();
    cursorTrack.position().addValueObserver(cursorTrackPositionObserver);

    cursorDevice = cursorTrack.createCursorDevice();

    // Knobs 
    remoteControls = cursorDevice.createCursorRemoteControlsPage(KNOB.COUNT);
    for (var i = 0; i < KNOB.COUNT; i++)    {
        remoteControls.getParameter(i).setIndication(true);
    }

    //Pageable tracks
    trackBank = host.createTrackBank(FADER.COUNT, 0, 0, false);
    trackBank.followCursorTrack(cursorTrack);

    for (var i = 0; i < FADER.COUNT; i++) {
        var bankTrack = trackBank.getChannel(i);
        bankTrack.name().markInterested();
        bankTrack.isActivated().markInterested();
        bankTrack.getMute().markInterested();
        bankTrack.position().markInterested();
    }

    rootTrackGroup = host.getProject().getRootTrackGroup();
}

function onMidi(status, data1, data2) {
    printMidi(status, data1, data2);

    if (isChannelController(status))
    {

        // Handle transport-buttons and track selection
        if ((isIn(data1, TRANSPORT.PREV_TRACK, TRANSPORT.RECORD)
            && data1 != 112) //112 is skipped in transport messages
            && data2 > 0) {

            switch(data1) {
                case TRANSPORT.PREV_TRACK:
                    cursorTrack.selectPrevious();
                    break;
                case TRANSPORT.NEXT_TRACK:
                    cursorTrack.selectNext();
                    break;
                case TRANSPORT.LOOP:
                    if (isShift) {
                        transport.tapTempo();
                    } else {
                        transport.toggleLoop();
                    }
                    break;
                case TRANSPORT.REWIND:
                    transport.rewind();
                    break;
                case TRANSPORT.FORWARD:
                    transport.fastForward();
                    break;
                case TRANSPORT.STOP:
                    transport.stop();
                    break;
                case TRANSPORT.PLAY:
                    transport.play();
                    break;
                case TRANSPORT.RECORD:
                    transport.record();
                    break;
            }

        // Handle fader for track volume
        } else if (isIn(data1, FADER.LOW, FADER.HIGH)) {
            if (isShift) {
                //drawbar mode
                noteIn.sendRawMidiEvent(status, data1, 127-data2);
            } else {
                trackBank.getChannel(data1 - FADER.LOW).getVolume().set(data2, D2);
            }
        }

        //Handle fader for master volume
        else if (data1 == FADER.MASTER) {
            if (isShift) {
                //drawbar mode
                noteIn.sendRawMidiEvent(status, data1, 127-data2);
            } else {
                masterTrack.getVolume().set(data2, D2);
            }
        }

        //Handle arm buttons
        else if (isIn(data1, BUTTON.LOW, BUTTON.HIGH) && data2 > 0) {
            var currentTrack = trackBank.getChannel(data1 - BUTTON.LOW);
            var currentTrackValueHolder = isShift
                ? currentTrack.getMute()
                : currentTrack.isActivated();
            var newValue = !currentTrackValueHolder.get();
            var isOn = isShift != newValue; //logical XOR
            if (!isOn) {
                noteIn.sendRawMidiEvent(S_CC_UNDEFINED, CC_SUSTAIN, 0); //send sustain off
            }
            currentTrackValueHolder.set(newValue);
            host.showPopupNotification(
                '['
                + (currentTrack.position().get() + 1)
                + '] '
                + currentTrack.name().get() 
                + ' '
                + BUTTON_MESSAGE_MAP[~~isShift][~~isOn] 
                );
        }

        //Handle shift button
        else if (data1 == BUTTON.SHIFT && data2 > 0) {
            isShift = !isShift;
            host.showPopupNotification('Shift ' + MESSAGES.ON_OFF[~~isShift]);
        } 

        // Handle knobs
        else if (isIn(data1, KNOB.LOW, KNOB.HIGH)) {
            var knobIndex = data1 - KNOB.LOW;
            knobParameter = remoteControls.getParameter(knobIndex);
            knobParameter.getAmount().set(data2, D2);
        }
        
        //Map Expression to Breath controller, as bitwig somehow gulps Expression messages
        else if (status == S_CC_UNDEFINED && data1 == CC_EXPRESSION) {
            noteIn.sendRawMidiEvent(status, 2, data2);
        }
    
    }
}

function isIn(value, low, high) {
    return value >= low && value <= high;
}

function exit()
{
}