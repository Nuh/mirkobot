#pisg.tcl v0.15 by HM2K - auto stats script for pisg (perl irc statistics generator)
#based on a script by Arganan

# WARNING - READ THIS
#
# If you use this script, PLEASE read the documentation about the "Silent"
# option. If you get the message "an error occured: Pisg v0.** - perl irc
# statistics generator" in the channel, you are NOT running silent. Fix it.

set pisgver "0.16"

#Location of pisg execuitable perl script
set pisgexe "/home/bot/pisg-0.73/pisg"

#URL of the generated stats
set pisgurl "http://nemesisforce.com/ircstats"

#channel that the stats are generated for
set pisgchan "#pisg"

#Users with these flags can operate this function (friendly/friends by default)
set pisgflags "f"

#How often the stats will be updated in minutes, ie: 30 - stats will be updated every 30 minutes
set pisgtime "180"

bind pub $pisgflags !pisgstats pub:pisgcmd1

proc pub:pisgcmd1 {nick host hand chan arg} {
	global pisgexe pisgurl
	append out "PRIVMSG $chan :"  
	if {[catch {exec $pisgexe} error]} { 
	append out "$pisgexe an error occured: [string totitle $error]" 
	} else { 
	append out "Stats: [string tolower ${pisgurl}[string trimleft $chan # ].html]"
	}
	puthelp $out
}

proc pisgcmd_timer {} {
	global pisgexe pisgurl pisgtime chan
	append out "PRIVMSG gchan :" 
	if {[catch {exec $pisgexe} error]} { 
	append out "$pisgexe an error occured: [string totitle $error]" 
	} else { 
	append out "Stats: [string tolower ${pisgurl}[string trimleft $chan # ].html]"
	}
	puthelp $out
	timer $pisgtime pisgcmd_timer
}

if {![info exists {pisgset}]} {
  set pisgset 1
  timer 2 pisgcmd_timer
}

putlog "pisg.tcl $pisgver loaded"
