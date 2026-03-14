import pygame
from pygame.locals import *
import os
from os.path import isfile, join
import time
import shared_states as st
from led_functions import led_off, led_on


class Viewer:
    def __init__(self):
        self.running = True
        self.current_zoom = 1
        
    def display_init(self):
        #create window
        self.window = pygame.display.set_mode((0,0),pygame.FULLSCREEN)
        pygame.mouse.set_visible(False)
        pygame.display.flip()

    def display_map(self):
        self.map =  pygame.image.load(st.map_path).convert()
        self.maprect = self.map.get_rect(center = self.window.get_rect().center)
        self.mx, self.my = self.window.get_rect().center
        self.blitmap()
        pygame.display.update()


    def blitmap(self):
        self.mapsurface = pygame.transform.smoothscale(self.map, self.maprect.size)
        self.zoomed = pygame.transform.scale_by(self.mapsurface, self.current_zoom)
        self.window.fill(0)
        self.window.blit(self.zoomed, self.maprect)

    def zoom(self):
        zoom_level = 0.7 + (int((st.potentio/1023)*40)) * 0.015
        if zoom_level >= (self.current_zoom - 0.1) and zoom_level <= (self.current_zoom + 0.1):
            self.current_zoom = zoom_level
            self.blitmap()
        else: pass
    
    def move(self,dx,dy):
        self.maprect.move_ip(dx,dy)
        self.blitmap()
        
    def shutdown_viewer(self):
        pygame.display.quit()

        
    def check_event(self):
        # move across image using joytick
        move_speed = 10
        
        if st.joystickX > 900:
            self.mx += move_speed
            self.move(move_speed,0)
        elif st.joystickX < 100:
            self.mx -= move_speed
            self.move(-move_speed,0)
        elif st.joystickY > 900:
            self.my += move_speed
            self.move(0,move_speed)
        elif st.joystickY < 100:
            self.my -= move_speed
            self.move(0,-move_speed)
        else: pass 
        
        # zoom into image
        self.zoom()
        
        pygame.display.update()



class SoundMachine:
    def __init__(self):
        pygame.mixer.init(frequency = 22050, size = -16, channels = 1, buffer = 2**12)
        pygame.mixer.set_num_channels(5) 
        self.channel1 = pygame.mixer.Channel(0) # argument must be int
        self.channel2 = pygame.mixer.Channel(1)
        self.channel3 = pygame.mixer.Channel(2)
        self.channel4 = pygame.mixer.Channel(3)
        self.channel5 = pygame.mixer.Channel(4)
        self.channels = [self.channel1, self.channel2, self.channel3, self.channel4]
        self.sounds = []
        self.effects = []

    def load_sounds(self):
        music = []
        for item in sorted(os.listdir(st.music_directory)):
            if isfile(join(st.music_directory, item)) and item[-3:] == "wav":
                itemsound = pygame.mixer.Sound(join(st.music_directory, item))
                music.append(itemsound)
        self.sounds.append(music)
        themes = []
        for theme_entry in os.listdir(st.themes_directory):
            theme = []
            theme_path = join(st.themes_directory, theme_entry)
            for item in sorted(os.listdir(theme_path)):
                if isfile(join(theme_path, item)) and item[-3:] == "wav":
                        itemsound = pygame.mixer.Sound(join(theme_path, item))
                        theme.append(itemsound)
            themes.append(theme)
        self.sounds.append(themes)
        for item in sorted(os.listdir(st.effects_directory)):
            if isfile(join(st.effects_directory, item)) and item[-3:] == "wav":
                itemsound = pygame.mixer.Sound(join(st.effects_directory, item))
                self.effects.append(itemsound)
                
        st.loaded_sounds = True
        
    def play_once(self,effect):
        st.effect = False
        channel = self.channel5
        volume = (1-(st.potentio + 1)/1030)
        channel.set_volume(float(volume))
        if len(self.effects) > effect:
            channel.play(self.effects[effect], loops = 0)
        else: pass
        for led in range(4):
            led_off(led)
        led_on(st.current_chan)
        time.sleep(1)
            
        
        

    def play_on_channel(self, sound, channel, loop = True, music = True):
        selected_channel = self.channels[channel]
        #set channelvolume before playing
        volume = (1-(st.potentio + 1)/1030)
        st.current_channel_volumes[channel] = float(volume)
        selected_channel.set_volume(float(volume))
        play = False
        if music:
            if len(self.sounds[0]) > sound:
                selected_sound = self.sounds[0][sound]
                play = True
            else: pass
        else:
            if len(self.sounds[1][st.current_theme]) > sound:
                selected_sound = self.sounds[1][st.current_theme][sound]
                play = True
            else: pass
        if loop and play:
            if st.current_chan_playing[st.current_chan -1]:
                selected_channel.fadeout(1000)
                selected_channel.play(selected_sound, loops=-1, fade_ms = 1000)
            else: 
                selected_channel.play(selected_sound, loops=-1, fade_ms = 1000)
            st.current_chan_playing[st.current_chan -1] = True
        elif loop == False and play:
            if st.current_chan_playing[st.current_chan -1]:
                selected_channel.fadeout(1000)
                selected_channel.play(selected_sound, fade_ms = 1000)
            else: 
                selected_channel.play(selected_sound, fade_ms = 1000)
            st.current_chan_playing[st.current_chan -1] = True
        else: pass
            
    def pause_unpause_channel(self, channel):
        selected_channel = self.channels[channel]
        if st.current_chan_playing[st.current_chan -1]:
            selected_channel.pause()
            st.current_chan_playing[st.current_chan-1] = False
            time.sleep(1)
        else:
            selected_channel.unpause()
            st.current_chan_playing[st.current_chan-1] = True
            time.sleep(1)
    
    def set_channel_volume(self, channel):
        volume = (1-(st.potentio + 1)/1030)
        selected_channel = self.channels[channel]
        current_vol = st.current_channel_volumes[channel]
        if volume >= (current_vol - 0.15) and volume <= (current_vol + 0.15):
            st.current_channel_volumes[channel] = float(volume)
            selected_channel.set_volume(float(volume))
        else: pass
        


if __name__ == "__main__":
    viewer = Viewer()
    #sm = SoundMachine()
    #sm.load_sounds()
    #sm.play_on_channel(0,0)
    viewer.display_map()
    while True:
        #change_vol = input("Vol >>>")
        #sm.set_channel_volume(0,float(change_vol))
        change_zoom = input("Zoom >>>")
        viewer.check_event(int(change_zoom))

