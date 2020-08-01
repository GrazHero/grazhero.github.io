    Title: Bootable, Incremental, External BTRFS Backup
    Date: 2020-06-21T03:22:14
    Tags: software, hardware, unix

For a while I've wanted to have a way for making bootable backups of my BTRFS-on-LVM-on-LUKS system to an external drive. There are several programs which use the snapshot system of BTRFS to streamline the process of making backups, but none of them seemed flexible enough. So I went about putting together a little system that's tailored to my personal setup.

<!-- more -->

# Setting Things Up

I started by partitioning the external drive identically to my main one. Once I did that, I moved on to bootstrapping the incremental 
backup system.

Most of what I did is based on [this](https://btrfs.wiki.kernel.org/index.php/Incremental_Backup#Doing_it_by_hand.2C_step_by_step) article, which was very useful.

The bootstrap process in that article left me with a backup subvolume which was readonly. Readonly makes sense for backups, but I really would like the option to boot right in to my backup without any hassle, in case my SSD were to completely fail at an inopportune moment. So I took a read/write snapshot of the backup subvolume, which I'll make bootable later.

```
$ sudo btrfs sub snap /mnt/backuproot/backup /mnt/backuproot/bootable
```

# Making it Bootable
Obviously several files make reference to the UUIDs of the partitions on my main drive. In order to make the bootable bootable subvolume work, I need to edit a couple files and copy them over.

I started by making a copy of `/etc/fstab` and replacing any UUID with the corresponding one for the external drive. Then I copied this version over to the bootable subvolume, replacing the version of the file it got from the snapshot earlier. Note that I have to copy it over every time I make a backup, as it will be overwritten by the snapshot.

Then I made a copy of `/etc/default/grub`, replaced any UUID, and copied it over. Like with `fstab`, I must repeat this every time I make a backup.

Now that `etc/default/grub` is in place, it's time to actually install grub to the EFI System Partition of the external drive (simply copying over the grub installation from the main drive won't work).

Before starting that though, I give the bootable subvol its own mount point. For some reason I ran into issues getting GRUB to install in the chroot later unless I did this.

```
$ sudo mount -t btrfs -o subvol=/bootable /dev/mapper/archimedes--backup-root /mnt/bootable
```

Now I mount the virtual filesystems.

```
$ for i in /dev /proc /sys /run; do; sudo mount -o bind $i /mnt/bootable$i; done
```

If you want a UEFI boot entry for the backup drive, you'll also need efivars to be mounted while you install GRUB.

Mount the external drive's ESP inside the bootable subvol.

```
$ sudo mount /dev/sdb1 /mnt/bootable/efi
```

And then chroot into it.

```
$ sudo chroot /mnt/bootable
```

From here, there are several things I need to do. First install GRUB. Because my ESP isn't included in the BTRFS snapshots, I only need to perform this step once.

```
# grub-install --target=x86_64-efi --efi-directory=/efi --bootloader-id=GRUBBACKUP
```

Then generate the config file. This step must be repeated every time (although that may not be the case on systems where /boot is a separate, non-BTRFS partition, come to think of it).

```
# grub-mkconfig -o /boot/grub/grub.cfg
```

And lastly I needed to regenerate the initramfs. Linux wasn't able to find any disks unless I did this. This step must be repeated every time as well.

```
# mkinitcpio -P
```

And there we go. The drive should be bootable now.

# Keeping it Bootable
You'll want to keep at least two subvolumes on the backup drive: the readonly one which directly mirrors your main filesystem, and the read/write one which has been modified to be bootable. Incremental backups can be done with the method described in the [aforementioned article](https://btrfs.wiki.kernel.org/index.php/Incremental_Backup#Doing_it_by_hand.2C_step_by_step). I decided on just deleting the bootable subvol after the incremental backup has happened, and then creating it again and repeating the necessary steps. This is fine because I only ever intend to boot into this in case of emergency. 

# Something Annoying to Be Aware of
If you have SYSTEMD, It's important to realize that it has no qualms about making its own BTRFS subvolumes without telling you. Notably, `/var/lib/machines` and `/var/lib/portables` are subvolumes that SyStEmD creates. Although subvolumes in question didn't initially get carried over with the incremental backup, they were created automatically upon booting into the backup drive, and they weren't deleted when the system shut down.

This caused some trouble for me. I'd written my script to first delete the bootable subvolume if it exists, but this could no longer happen. `btrfs subvolume delete` is not recursive, and will fail if there are any subvolumes beneath the one you're operating on. I hadn't bothered accounting for this in my script, because I obviously wasn't expecting there to be a subvolume there.

At any rate, it was at least a pretty easy fix, once I'd managed to find any posts on the Internet about it at all. As far as I can tell, Nothing on my system is even using the programs associated with these subvolumes, and the subvolumes aren't actually necessary for them to function. Thanks sYsTeMd.

```
$ sudo btrfs sub del /var/lib/machines
$ sudo btrfs sub del /var/lib/portables
$ sudo mkdir /var/lib/machines /var/lib/portables
```

# My Script
## Don't use this script. It's not well made. This is purely for reference. I'm not responsible for your data loss.
If you've followed the initial bootstrapping instructions [here](https://btrfs.wiki.kernel.org/index.php/Incremental_Backup#Doing_it_by_hand.2C_step_by_step) and installed GRUB, this automates the rest. There are a lot of improvements I would like to make, but for now I'm just really happy that it works.

I'll post an addendum if it turns out I've made some horrible mistake, or if I make any notable improvements. 

```
#!/bin/zsh

# backup drive must already be decrypted

BACKUP_BTRFS_UUID=8037eb01-c46c-4a6e-abb7-8d3d55aeedce
CORRECTED_FSTAB_PATH=/home/tim/backup-system/fstab-backup-drive
CORRECTED_GRUB_CFG_PATH=/home/tim/backup-system/grub-backup-drive
ROOT_ROOTVOL_MOUNTPOINT=/mnt/rootvol
ROOT_SUBVOL_MOUNTPOINT=/mnt/rootvol/root
BACKUP_ROOTVOL_MOUNTPOINT=/mnt/backuproot
BACKUP_BOOTABLE_SUBVOL_MOUNTPOINT=/mnt/bootable

if [ $(whoami) != root ]; then
    echo "This script must be run as root"
elif ! [ $(ls /dev/disk/by-uuid | grep $BACKUP_BTRFS_UUID) ]; then
    echo "Can't find BTRFS partition. Has the disk been decrypted?"
else
    # start by mounting the backup rootvol
    mount -t btrfs /dev/disk/by-uuid/$BACKUP_BTRFS_UUID $BACKUP_ROOTVOL_MOUNTPOINT
    
    # make a new snapshot
    btrfs sub snap -r $ROOT_SUBVOL_MOUNTPOINT $ROOT_ROOTVOL_MOUNTPOINT/backup-new
    sync
    
    # now send the difference between the old and new backup
    btrfs send -p $ROOT_ROOTVOL_MOUNTPOINT/backup $ROOT_ROOTVOL_MOUNTPOINT/backup-new | btrfs receive $BACKUP_ROOTVOL_MOUNTPOINT
    
    # Now delete the old snapshots
    btrfs sub delete $ROOT_ROOTVOL_MOUNTPOINT/backup
    mv $ROOT_ROOTVOL_MOUNTPOINT/backup-new $ROOT_ROOTVOL_MOUNTPOINT/backup
    btrfs sub delete $BACKUP_ROOTVOL_MOUNTPOINT/backup
    mv $BACKUP_ROOTVOL_MOUNTPOINT/backup-new $BACKUP_ROOTVOL_MOUNTPOINT/backup

    # Now make a read/write snapshot of the backup, on the external drive.
    # This will be the one we can boot into.
    # First make sure we delete it if it already exists.
    btrfs sub delete $BACKUP_ROOTVOL_MOUNTPOINT/bootable
    btrfs sub snap $BACKUP_ROOTVOL_MOUNTPOINT/backup $BACKUP_ROOTVOL_MOUNTPOINT/bootable

    # Mount it. This is going to be the bootable subvol.
    mount -t btrfs -o subvol=/bootable /dev/disk/by-uuid/$BACKUP_BTRFS_UUID $BACKUP_BOOTABLE_SUBVOL_MOUNTPOINT
    
    # We need to have edited copies of /etc/fstab and /etc/default/grub, such that
    # any UUIDs of the main drive are changed to those of the external one.
    # We copy them over to the bootable subvol on the external drive.
    cp $CORRECTED_FSTAB_PATH $BACKUP_BOOTABLE_SUBVOL_MOUNTPOINT/etc/fstab
    cp $CORRECTED_GRUB_CFG_PATH $BACKUP_BOOTABLE_SUBVOL_MOUNTPOINT/etc/default/grub

    # Mount virtual filesystems in preparation for chroot
    for i in /dev /proc /sys /run; do
    	mount -o bind $i $BACKUP_BOOTABLE_SUBVOL_MOUNTPOINT$i
    done

    # Chroot to generate grub config and initrd for the bootable subvol.
    chroot $BACKUP_BOOTABLE_SUBVOL_MOUNTPOINT zsh -c "grub-mkconfig -o /boot/grub/grub.cfg; mkinitcpio -P"

    # unmount virtual filesystems
    for i in /dev /proc /sys /run; do
    	umount $BACKUP_BOOTABLE_SUBVOL_MOUNTPOINT$i
    done
fi
```

