// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import classNames from 'classnames';
import { get, noop } from 'lodash';
import { Manager, Popper, Reference } from 'react-popper';
import { createPortal } from 'react-dom';

import type { StickerPackType, StickerType } from '../../state/ducks/stickers';
import type { LocalizerType } from '../../types/Util';
import type { Theme } from '../../util/theme';
import { countStickers } from './lib';
import { offsetDistanceModifier } from '../../util/popperUtil';
import { themeClassName } from '../../util/theme';
import * as KeyboardLayout from '../../services/keyboardLayout';
import { useRefMerger } from '../../hooks/useRefMerger';
import { Modal } from '../Modal';


const apiKey = process.env.GIPHY_API_KEY || "PrX9cDCZwBMq2bi1hYKd79r1h44fSCnk";

const apiURL = (query: string) => {
  return 'https://api.giphy.com/v1/gifs/search?q=' + query + '&api_key=' + apiKey + '&rating=pg'
}

export type OwnProps = {
  readonly className?: string;
  readonly i18n: LocalizerType;
  readonly position?: 'top-end' | 'top-start';
  readonly theme?: Theme;
};

export type Props = OwnProps;

export const GiphyButton = React.memo(
  ({
    className,
    i18n,
    position = 'top-end',
    theme,
  }: Props) => {
    const [open, setOpen] = React.useState(false);
    const [popperRoot, setPopperRoot] = React.useState<HTMLElement | null>(
      null
    );
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const refMerger = useRefMerger();
    const [gifs, setGifs] = React.useState([]);
    const [searchString, setSearchString] = React.useState("dogs");

    React.useEffect(() => {
      // Function to get gifs
      fetch(apiURL(searchString)).then((response) => {
        return response.json()
      }).then(function(json) {
        setGifs(json.data);
      }).catch(function(ex) {
        console.warn('ERROR: ', ex)
      })
    }, [searchString])

    const handleClickButton = React.useCallback(() => {
      if (popperRoot) {
        setOpen(false);
      } else {
        setOpen(true);
      }
    }, [
      popperRoot,
      setOpen,
    ]);

    // const handlePickSticker = React.useCallback(
    //   (packId: string, stickerId: number, url: string) => {
    //     setOpen(false);
    //     onPickSticker(packId, stickerId, url);
    //   },
    //   [setOpen, onPickSticker]
    // );

    const onClose = React.useCallback(() => {
      setOpen(false);
    }, [setOpen]);

    // Create popper root and handle outside clicks
    React.useEffect(() => {
      if (open) {
        console.log('HERE!')
        const root = document.createElement('div');
        setPopperRoot(root);
        document.body.appendChild(root);
        const handleOutsideClick = ({ target }: MouseEvent) => {
          const targetElement = target as HTMLElement;
          const targetClassName = targetElement
            ? targetElement.className || ''
            : '';

          // We need to special-case sticker picker header buttons, because they can
          //   disappear after being clicked, which breaks the .contains() check below.
          const isMissingButtonClass =
            !targetClassName ||
            targetClassName.indexOf('module-sticker-picker__header__button') <
              0;

          if (
            !root.contains(targetElement) &&
            isMissingButtonClass &&
            targetElement !== buttonRef.current
          ) {
            setOpen(false);
          }
        };
        document.addEventListener('click', handleOutsideClick);

        return () => {
          document.body.removeChild(root);
          document.removeEventListener('click', handleOutsideClick);
          setPopperRoot(null);
        };
      }

      return noop;
    }, [open, setOpen, setPopperRoot]);

    // Install keyboard shortcut to open sticker picker
    React.useEffect(() => {
      const handleKeydown = (event: KeyboardEvent) => {
        const { ctrlKey, metaKey, shiftKey } = event;
        const commandKey = get(window, 'platform') === 'darwin' && metaKey;
        const controlKey = get(window, 'platform') !== 'darwin' && ctrlKey;
        const commandOrCtrl = commandKey || controlKey;
        const key = KeyboardLayout.lookup(event);

        // We don't want to open up if the conversation has any panels open
        const panels = document.querySelectorAll('.conversation .panel');
        if (panels && panels.length > 1) {
          return;
        }

        if (commandOrCtrl && shiftKey && (key === 's' || key === 'S')) {
          event.stopPropagation();
          event.preventDefault();

          setOpen(!open);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      return () => {
        document.removeEventListener('keydown', handleKeydown);
      };
    }, [open, setOpen]);


    return (
      <Manager>
        <Reference>
          {({ ref }) => (
            <button
              type="button"
              ref={refMerger(buttonRef, ref)}
              onClick={handleClickButton}
              className={classNames(
                {
                  'module-sticker-button__button': true,
                  'module-sticker-button__button--active': open,
                },
                className
              )}
              aria-label={i18n('stickers--StickerPicker--Open')}
            />
          )}
        </Reference>
        {open
          ? (
            <Modal hasXButton i18n={i18n} onClose={onClose}>
              {
                gifs.map((item) => (
                  <img data-url={`"${item?.images.original.url}"`} src={item?.images.original.url} />
                ))
              }
            </Modal>
          ) : null}
      </Manager>
    );
  }
);
