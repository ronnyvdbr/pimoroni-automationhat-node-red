#!/usr/bin/env python

import sys
import time
import atexit
from threading import Thread, Event
from Queue import Queue, Empty

""" Check if we can find the GPIO library and necessary classes """
try:
    import RPi.GPIO as GPIO
except ImportError:
    exit("This library requires the RPi.GPIO module\nInstall with: sudo pip install RPi.GPIO")


""" Define the RPI pin class """
class Pin(object):
    type = 'Pin'

    def __init__(self, pin):
        self.pin = pin
        self._last_value = None

    def __call__(self):
        return filter(lambda x: x[0] != '_', dir(self))

    def read(self):
        return GPIO.input(self.pin)

    def has_changed(self):
        value = self.read()

        if self._last_value is None:
            self._last_value = value

        if value is not self._last_value:
            self._last_value = value
            return True

        return False

    def is_on(self):
        return self.read() == 1

    def is_off(self):
        return self.read() == 0

    
""" Define output class to drive the output pin """
class Output(Pin):
    type = 'Digital Output'

    def __init__(self, pin):
        Pin.__init__(self, pin)
        GPIO.setup(self.pin, GPIO.OUT, initial=0)

    def write(self, value):
        GPIO.output(self.pin, value)

    def on(self):
        self.write(1)

    def off(self):
        self.write(0)

    def toggle(self):
        self.write(not self.read())


""" Initialize our raspberry pi GPIO subsys """
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)


def _cleanup():
    GPIO.cleanup()

atexit.register(_cleanup)


""" Define a non-blocking stream reader """
class NonBlockingStreamReader:

    def __init__(self, stream):
        '''
        stream: the stream to read from.
                Usually a process' stdout or stderr.
        '''

        self._s = stream
        self._q = Queue()
        self._stop_event = Event()

        def _populateQueue(stream, queue, stop_event):
            '''
            Collect lines from 'stream' and put them in 'queue'.
            '''
            while not stop_event.is_set():
                line = stream.readline()
                if line:
                    queue.put(line)

        self._t = Thread(target = _populateQueue,
                args = (self._s, self._q, self._stop_event))
        self._t.daemon = True
        self._t.start() #start collecting lines from the stream

    def readline(self, timeout = None):
        try:
            return self._q.get(block = timeout is not None, timeout = timeout)
        except Empty:
            return None

    def stop(self):
        self._stop_event.set()


""" Define a timer to measure milliseconds """
def millis():
    return int(round(time.time() * 1000))

""" Define some logging classes """
def emit(message):
    sys.stdout.write(message + "\n")
    sys.stdout.flush()

def info(message):
    emit("INFO: " + message)

def error(message):
    emit("ERROR: " + message)

def fatal(message):
    emit("FATAL: " + message)
    sys.exit(1)


""" and here we go """
info("Starting up...")
running = True
info("Start reading input stream...")
stdin = NonBlockingStreamReader(sys.stdin)

def handle_command(cmd):
    if cmd is not None:
        if type(cmd).__name__ == 'str':
            info("Incoming string message, value: " + cmd)
            if cmd.strip() == 'true' or cmd.strip() == '1': 
                Output(5).on()
            elif cmd.strip() == 'false' or cmd.strip() == '0':
                Output(5).off()
            elif cmd.strip() == 'toggle' or cmd.strip() == '2':
                Output(5).toggle()
            else:
                error("Incoming message ignored, only accept boolean, string or integer, with values: true,false,toggle,0,1,2")

info("Watching for incoming messages...")
while running:
    cmd = stdin.readline(0.1)
    handle_command(cmd)
    time.sleep(0.001)
