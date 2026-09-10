#!/usr/bin/env perl
# Deepen only the links that escaped the archive.
#
#   - A link that still resolves from its file was internal (both ends moved
#     together) and is left alone.
#   - One that resolves with an extra ../ was outbound and gets it.
#   - Anything that resolves neither way was already broken before the move.
#   - Fenced code blocks are skipped: they quote text belonging to other files,
#     at other depths, and must stay verbatim.
use strict; use warnings;
use File::Basename qw(dirname);
my $changed = 0;
for my $f (@ARGV) {
    my $d = dirname($f);
    open my $in, '<', $f or die "$f: $!";
    my $src = do { local $/; <$in> }; close $in;
    my ($fence, $out) = (0, '');
    for my $line (split /^/, $src) {
        if ($line =~ /^\s*```/) { $fence = !$fence; $out .= $line; next }
        $line =~ s{\]\(([^)\s]+)\)}{
            my $t = $1;
            my ($p, $frag) = split(/#/, $t, 2);
            $frag = defined $frag ? "#$frag" : "";
            ($p =~ m{^\.\./} && ! -e "$d/$p" && -e "$d/../$p")
                ? "](../$p$frag)" : "]($t)"
        }ge unless $fence;
        $out .= $line;
    }
    next if $out eq $src;
    open my $o, '>', $f or die "$f: $!"; print $o $out; close $o;
    $changed++;
}
print "rewrote $changed file(s)\n";
